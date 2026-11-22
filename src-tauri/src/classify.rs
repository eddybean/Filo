//! 自動判定: 保存先直下のサブフォルダ名とファイル名を照合し、最も合致するフォルダを選ぶ。
//!
//! モデルは使わず、決定的な文字列マッチングで判定する。
//! 1. 正規化（NFKC・小文字化・カタカナ→ひらがな・異体字の寄せ）
//! 2. トークン化（区切り文字と、ASCII 英字/非 ASCII の境界で分割）
//! 3. IDF の考え方で、多くのフォルダに出てくる語を軽くする
//! 4. フォルダごとに max(S_sub, S_cov, S_win) でスコアを付け、しきい値で採否を決める

use serde::Serialize;

/// 採用に必要な最低スコア
pub const MIN_SCORE: f64 = 0.5;
/// 採用に必要な 1位と2位のスコア差
pub const MIN_MARGIN: f64 = 0.15;

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct ClassifyResult {
    pub folder: Option<String>,
    pub score: f64,
    pub reason: Option<String>,
}

/// 曖昧一致とみなすトークンの Levenshtein 類似度の下限
const FUZZY_TOKEN_MIN_SIM: f64 = 0.8;
/// 曖昧一致の対象にするトークンの最小文字数
const FUZZY_TOKEN_MIN_LEN: usize = 3;
/// S_win を採用する類似度の下限
const WINDOW_MIN_SIM: f64 = 0.75;
/// S_win の対象にするフォルダ compact の最小文字数
const WINDOW_MIN_LEN: usize = 4;
/// S_win の減衰係数
const WINDOW_FACTOR: f64 = 0.9;

pub const REASON_NO_MATCH: &str = "Auto-classify: no matching folder";

/// 異体字の対応表（左を右に寄せる）。必要に応じて追加する。
const VARIANT_CHARS: &[(char, char)] = &[
    ('鷗', '鴎'),
    ('澤', '沢'),
    ('髙', '高'),
    ('﨑', '崎'),
    ('嵜', '崎'),
    ('邊', '辺'),
    ('邉', '辺'),
    ('齋', '斎'),
    ('齊', '斎'),
    ('濱', '浜'),
    ('國', '国'),
    ('廣', '広'),
    ('櫻', '桜'),
    ('實', '実'),
    ('惠', '恵'),
    ('德', '徳'),
];

/// トークンの区切り文字（NFKC の後なので全角の ASCII 記号は半角になっている）
const SEPARATORS: &[char] = &[
    '[', ']', '【', '】', '(', ')', '「', '」', '『', '』', '〔', '〕', '{', '}', '<', '>', '《',
    '》', '〈', '〉', '_', '-', '・', ',', '、', '。', '.', '+', '&', '~', '〜', '!', '?', '#',
    '\'', '"', '/', '\\', ':', ';', '=', '@', '|', '…', '‐', '–', '—', '―',
];

fn is_separator(c: char) -> bool {
    c.is_whitespace() || SEPARATORS.contains(&c)
}

/// NFKC・小文字化・カタカナ→ひらがな・異体字の寄せを行う。
pub fn normalize(s: &str) -> String {
    use unicode_normalization::UnicodeNormalization;
    s.nfkc()
        .flat_map(char::to_lowercase)
        .map(|c| {
            if ('\u{30A1}'..='\u{30F6}').contains(&c) {
                char::from_u32(c as u32 - 0x60).unwrap_or(c)
            } else {
                VARIANT_CHARS
                    .iter()
                    .find(|(from, _)| *from == c)
                    .map(|(_, to)| *to)
                    .unwrap_or(c)
            }
        })
        .collect()
}

/// 文字の種別。ASCII 英字と非 ASCII の境界でトークンを分ける。数字は前後に付く。
#[derive(PartialEq, Clone, Copy)]
enum CharClass {
    AsciiLetter,
    NonAscii,
    Neutral,
}

fn char_class(c: char) -> CharClass {
    if c.is_ascii_digit() {
        CharClass::Neutral
    } else if c.is_ascii() {
        CharClass::AsciiLetter
    } else {
        CharClass::NonAscii
    }
}

/// 正規化してからトークンに分ける。数字だけのトークンは捨てる。
pub fn tokenize(s: &str) -> Vec<String> {
    let mut tokens = Vec::new();
    let mut current = String::new();
    let mut current_class = CharClass::Neutral;
    fn flush(current: &mut String, tokens: &mut Vec<String>) {
        if !current.is_empty() && !current.chars().all(|c| c.is_ascii_digit()) {
            tokens.push(std::mem::take(current));
        } else {
            current.clear();
        }
    }
    for c in normalize(s).chars() {
        if is_separator(c) {
            flush(&mut current, &mut tokens);
            current_class = CharClass::Neutral;
            continue;
        }
        let class = char_class(c);
        if class != CharClass::Neutral {
            if current_class != CharClass::Neutral && class != current_class {
                flush(&mut current, &mut tokens);
            }
            current_class = class;
        }
        current.push(c);
    }
    flush(&mut current, &mut tokens);
    tokens
}

/// 正規化した後に区切り文字をすべて除いた連結文字列
fn compact(s: &str) -> String {
    normalize(s).chars().filter(|c| !is_separator(*c)).collect()
}

/// 文字単位の Levenshtein 類似度 `1 - d / max_len`
fn similarity(a: &str, a_len: usize, b: &str, b_len: usize) -> f64 {
    let max_len = a_len.max(b_len);
    if max_len == 0 {
        return 1.0;
    }
    1.0 - strsim::levenshtein(a, b) as f64 / max_len as f64
}

/// 長さの差だけで類似度の上限がしきい値に届かないと分かるなら true
fn cannot_reach(a_len: usize, b_len: usize, min_sim: f64) -> bool {
    let max_len = a_len.max(b_len);
    max_len > 0 && 1.0 - (a_len.abs_diff(b_len) as f64 / max_len as f64) < min_sim
}

struct FolderToken {
    text: String,
    len: usize,
    weight: f64,
}

struct FolderEntry {
    name: String,
    compact: String,
    compact_len: usize,
    has_non_ascii: bool,
    tokens: Vec<FolderToken>,
    total_weight: f64,
}

struct Scored<'a> {
    folder: &'a FolderEntry,
    score: f64,
    is_sub: bool,
}

/// 候補フォルダのトークンと重みを前計算しておき、ファイル名ごとに判定する。
pub struct Classifier {
    folders: Vec<FolderEntry>,
}

impl Classifier {
    pub fn new(folders: &[String]) -> Self {
        let tokenized: Vec<Vec<String>> = folders
            .iter()
            .map(|name| {
                let mut tokens = tokenize(name);
                tokens.sort();
                tokens.dedup();
                tokens
            })
            .collect();

        let mut df: std::collections::HashMap<&str, usize> = std::collections::HashMap::new();
        for tokens in &tokenized {
            for t in tokens {
                *df.entry(t.as_str()).or_insert(0) += 1;
            }
        }
        let n = folders.len() as f64;

        let entries = folders
            .iter()
            .zip(tokenized.iter())
            .map(|(name, tokens)| {
                let tokens: Vec<FolderToken> = tokens
                    .iter()
                    .map(|t| FolderToken {
                        text: t.clone(),
                        len: t.chars().count(),
                        weight: ((n + 1.0) / df[t.as_str()] as f64).ln(),
                    })
                    .collect();
                let total_weight = tokens.iter().map(|t| t.weight).sum();
                let compact = compact(name);
                FolderEntry {
                    name: name.clone(),
                    compact_len: compact.chars().count(),
                    has_non_ascii: !compact.is_ascii(),
                    compact,
                    tokens,
                    total_weight,
                }
            })
            .collect();
        Self { folders: entries }
    }

    /// 候補フォルダが1つもないなら true
    pub fn is_empty(&self) -> bool {
        self.folders.is_empty()
    }

    pub fn classify(&self, filename: &str) -> ClassifyResult {
        let stem = std::path::Path::new(filename)
            .file_stem()
            .map(|s| s.to_string_lossy().to_string())
            .unwrap_or_else(|| filename.to_string());
        let file_compact = compact(&stem);
        let file_tokens: Vec<(String, usize)> = tokenize(&stem)
            .into_iter()
            .map(|t| {
                let len = t.chars().count();
                (t, len)
            })
            .collect();

        let mut scored: Vec<Scored> = self
            .folders
            .iter()
            .map(|f| {
                let is_sub = f.has_non_ascii && file_compact.contains(&f.compact);
                let score = if is_sub {
                    1.0
                } else {
                    coverage_score(f, &file_tokens).max(window_score(f, &file_tokens))
                };
                Scored {
                    folder: f,
                    score,
                    is_sub,
                }
            })
            .collect();

        // スコア降順、同点なら compact が長い（より具体的な）ものを優先する
        scored.sort_by(|a, b| {
            b.score
                .partial_cmp(&a.score)
                .unwrap_or(std::cmp::Ordering::Equal)
                .then(b.folder.compact_len.cmp(&a.folder.compact_len))
        });

        let Some(top) = scored.first() else {
            return no_match(0.0);
        };

        // 1位との差が MIN_MARGIN 未満の競合候補
        let competitors: Vec<&Scored> = scored[1..]
            .iter()
            .filter(|s| s.score > 0.0 && top.score - s.score < MIN_MARGIN)
            .collect();

        // 部分一致同士で、競合がすべて 1位の compact に含まれる（より短い）なら長い 1位を採る
        let resolved_by_containment = top.is_sub
            && competitors.iter().all(|c| {
                c.folder.compact_len < top.folder.compact_len
                    && top.folder.compact.contains(&c.folder.compact)
            });

        if top.score >= MIN_SCORE && (competitors.is_empty() || resolved_by_containment) {
            return ClassifyResult {
                folder: Some(top.folder.name.clone()),
                score: top.score,
                reason: None,
            };
        }

        // 1位と僅差の候補があれば（しきい値未満でも）拮抗として理由を返す
        if let Some(second) = competitors.first() {
            return ClassifyResult {
                folder: None,
                score: top.score,
                reason: Some(format!(
                    "Auto-classify: ambiguous between '{}' and '{}'",
                    top.folder.name, second.folder.name
                )),
            };
        }
        no_match(top.score)
    }
}

fn no_match(score: f64) -> ClassifyResult {
    ClassifyResult {
        folder: None,
        score,
        reason: Some(REASON_NO_MATCH.to_string()),
    }
}

/// S_cov: フォルダトークンの重み付き被覆率
fn coverage_score(folder: &FolderEntry, file_tokens: &[(String, usize)]) -> f64 {
    if folder.total_weight <= 0.0 {
        return 0.0;
    }
    let covered: f64 = folder
        .tokens
        .iter()
        .map(|ft| {
            let best = file_tokens
                .iter()
                .map(|(t, len)| {
                    if *t == ft.text {
                        1.0
                    } else if ft.len < FUZZY_TOKEN_MIN_LEN
                        || *len < FUZZY_TOKEN_MIN_LEN
                        || cannot_reach(ft.len, *len, FUZZY_TOKEN_MIN_SIM)
                    {
                        0.0
                    } else {
                        let sim = similarity(&ft.text, ft.len, t, *len);
                        if sim >= FUZZY_TOKEN_MIN_SIM {
                            sim
                        } else {
                            0.0
                        }
                    }
                })
                .fold(0.0, f64::max);
            ft.weight * best
        })
        .sum();
    covered / folder.total_weight
}

/// S_win: フォルダの compact と、ファイルの連続トークンを連結したものの類似度（誤字の救済）
fn window_score(folder: &FolderEntry, file_tokens: &[(String, usize)]) -> f64 {
    if folder.compact_len < WINDOW_MIN_LEN || file_tokens.is_empty() {
        return 0.0;
    }
    let max_window = folder.tokens.len() + 1;
    let mut best = 0.0_f64;
    for start in 0..file_tokens.len() {
        let mut joined = String::new();
        let mut joined_len = 0;
        for (t, len) in file_tokens.iter().skip(start).take(max_window) {
            joined.push_str(t);
            joined_len += len;
            if cannot_reach(folder.compact_len, joined_len, WINDOW_MIN_SIM) {
                if joined_len > folder.compact_len {
                    break;
                }
                continue;
            }
            let sim = similarity(&folder.compact, folder.compact_len, &joined, joined_len);
            if sim >= WINDOW_MIN_SIM {
                best = best.max(sim * WINDOW_FACTOR);
            }
        }
    }
    best
}

#[cfg(test)]
mod tests {
    use super::*;

    fn folders(names: &[&str]) -> Vec<String> {
        names.iter().map(|s| s.to_string()).collect()
    }

    fn classify_one(filename: &str, names: &[&str]) -> ClassifyResult {
        Classifier::new(&folders(names)).classify(filename)
    }

    // --- normalize ---

    #[test]
    fn test_normalize_fullwidth_to_halfwidth_and_lowercase() {
        assert_eq!(normalize("ＰＹＴＨＯＮ１２３"), "python123");
        assert_eq!(normalize("（新潮社）"), "(新潮社)");
    }

    #[test]
    fn test_normalize_katakana_to_hiragana() {
        assert_eq!(normalize("ラショウモン"), "らしょうもん");
        // 半角カナは NFKC で全角になってからひらがなに寄る
        assert_eq!(normalize("ﾗｼｮｳﾓﾝ"), "らしょうもん");
    }

    #[test]
    fn test_normalize_variant_kanji() {
        assert_eq!(normalize("宮澤賢治"), "宮沢賢治");
        assert_eq!(normalize("森鷗外"), "森鴎外");
        assert_eq!(normalize("髙橋"), "高橋");
        assert_eq!(normalize("山﨑"), "山崎");
        assert_eq!(normalize("渡邊"), "渡辺");
        assert_eq!(normalize("齋藤"), "斎藤");
        assert_eq!(normalize("濱田"), "浜田");
    }

    // --- tokenize ---

    #[test]
    fn test_tokenize_splits_on_brackets_and_separators() {
        assert_eq!(
            tokenize("[太宰治(新潮社)] TE RAVN"),
            vec!["太宰治", "新潮社", "te", "ravn"]
        );
        assert_eq!(
            tokenize("宮澤賢治_銀河鉄道の夜"),
            vec!["宮沢賢治", "銀河鉄道の夜"]
        );
        assert_eq!(
            tokenize("【東野圭吾】「容疑者」"),
            vec!["東野圭吾", "容疑者"]
        );
    }

    #[test]
    fn test_tokenize_drops_digit_only_tokens() {
        assert_eq!(tokenize("report 2024 final"), vec!["report", "final"]);
        assert_eq!(tokenize("  --  "), Vec::<String>::new());
    }

    #[test]
    fn test_tokenize_splits_ascii_letters_and_non_ascii() {
        assert_eq!(tokenize("ＰＹＴＨＯＮ入門"), vec!["python", "入門"]);
        // 数字は前後の文字に付く
        assert_eq!(tokenize("第1巻"), vec!["第1巻"]);
    }

    #[test]
    fn test_classify_ignores_extension() {
        // 拡張子 "rust" はトークンにならない
        let r = classify_one("memo.rust", &["Rust", "Go"]);
        assert_eq!(r.folder, None);
    }

    // --- 受け入れケース ---

    #[test]
    fn test_accept_natsume() {
        let r = classify_one("[夏目漱石] 吾輩は猫である.txt", &["夏目漱石", "芥川龍之介"]);
        assert_eq!(r.folder.as_deref(), Some("夏目漱石"));
    }

    #[test]
    fn test_accept_dazai_with_publisher() {
        let r = classify_one(
            "[太宰治(新潮社)] 人間失格 上巻.zip",
            &["太宰治(新潮社)", "芥川龍之介(新潮社)"],
        );
        assert_eq!(r.folder.as_deref(), Some("太宰治(新潮社)"));
    }

    #[test]
    fn test_accept_dazai_without_publisher_uses_coverage() {
        let r = classify_one(
            "[太宰治] 人間失格.zip",
            &["太宰治(新潮社)", "芥川龍之介(新潮社)"],
        );
        assert_eq!(r.folder.as_deref(), Some("太宰治(新潮社)"));
        assert!((r.score - 0.73).abs() < 0.01, "score = {}", r.score);
    }

    #[test]
    fn test_accept_akutagawa_publisher_elsewhere() {
        let r = classify_one(
            "[芥川龍之介] 羅生門 (新潮社).zip",
            &["太宰治(新潮社)", "芥川龍之介(新潮社)"],
        );
        assert_eq!(r.folder.as_deref(), Some("芥川龍之介(新潮社)"));
    }

    #[test]
    fn test_accept_ambiguous_same_author_different_publisher() {
        let r = classify_one(
            "[太宰治] 人間失格.zip",
            &["太宰治(新潮社)", "太宰治(岩波書店)"],
        );
        assert_eq!(r.folder, None);
        let reason = r.reason.unwrap();
        assert!(reason.contains("ambiguous"), "reason = {}", reason);
    }

    #[test]
    fn test_accept_longer_substring_wins() {
        let r = classify_one("[太宰治(新潮社)] x.zip", &["太宰治", "太宰治(新潮社)"]);
        assert_eq!(r.folder.as_deref(), Some("太宰治(新潮社)"));
    }

    #[test]
    fn test_accept_variant_kanji() {
        let r = classify_one("宮澤賢治_銀河鉄道の夜.pdf", &["宮沢賢治", "太宰治"]);
        assert_eq!(r.folder.as_deref(), Some("宮沢賢治"));
    }

    #[test]
    fn test_accept_fullwidth_ascii() {
        let r = classify_one("ＰＹＴＨＯＮ入門.pdf", &["Python", "Rust"]);
        assert_eq!(r.folder.as_deref(), Some("Python"));
    }

    #[test]
    fn test_accept_ascii_folder_is_not_substring_matched() {
        let r = classify_one("Google_Drive.pdf", &["Go", "Rust"]);
        assert_eq!(r.folder, None);
        assert_eq!(
            r.reason.as_deref(),
            Some("Auto-classify: no matching folder")
        );
    }

    #[test]
    fn test_accept_ascii_token() {
        let r = classify_one("rust_book.pdf", &["Go", "Rust"]);
        assert_eq!(r.folder.as_deref(), Some("Rust"));
    }

    #[test]
    fn test_accept_typo_window() {
        let r = classify_one("TE RAVN 第1巻.zip", &["THE RAVEN", "HAMLET"]);
        assert_eq!(r.folder.as_deref(), Some("THE RAVEN"));
    }

    #[test]
    fn test_accept_spaced_name() {
        let r = classify_one("東野 圭吾 - 容疑者Xの献身.txt", &["東野圭吾", "宮部みゆき"]);
        assert_eq!(r.folder.as_deref(), Some("東野圭吾"));
    }

    #[test]
    fn test_accept_no_match_ascii_file() {
        let r = classify_one("random_notes.txt", &["夏目漱石", "写真"]);
        assert_eq!(r.folder, None);
    }

    #[test]
    fn test_accept_no_match_other_author() {
        let r = classify_one("[吉川英治] 宮本武蔵.txt", &["夏目漱石", "宮沢賢治"]);
        assert_eq!(r.folder, None);
    }

    // --- その他 ---

    #[test]
    fn test_empty_folder_list_returns_none() {
        let r = classify_one("[夏目漱石] こころ.txt", &[]);
        assert_eq!(r.folder, None);
        assert!(r.reason.is_some());
    }

    #[test]
    fn test_ambiguous_reason_names_both_folders() {
        // 正規化すると同じ名前になる 2 フォルダは区別できない
        let r = classify_one("宮沢賢治_春と修羅.txt", &["宮沢賢治", "宮澤賢治"]);
        assert_eq!(r.folder, None);
        let reason = r.reason.unwrap();
        assert!(
            reason.starts_with("Auto-classify: ambiguous between '"),
            "reason = {}",
            reason
        );
        assert!(reason.contains("'宮沢賢治'") && reason.contains("'宮澤賢治'"));
    }

    /// 300 件の候補から選ぶ。共通語（出版社名）が多くのフォルダに出てきても正しく選べ、速いこと。
    #[test]
    fn test_many_candidates_correct_and_fast() {
        let chars: Vec<char> = "赤青黄緑紫白黒金銀桃".chars().collect();
        let publishers = ["新潮社", "岩波書店", "角川書店"];
        let mut names: Vec<String> = (0..300)
            .map(|i| {
                format!(
                    "{}{}{}作家({})",
                    chars[i % 10],
                    chars[(i / 10) % 10],
                    chars[(i / 100) % 10],
                    publishers[i % 3]
                )
            })
            .collect();
        names.push("太宰治(新潮社)".to_string());
        names.push("芥川龍之介(新潮社)".to_string());
        names.push("夏目漱石".to_string());
        names.push("THE RAVEN".to_string());

        let clf = Classifier::new(&names);
        let start = std::time::Instant::now();
        for _ in 0..50 {
            assert_eq!(
                clf.classify("[太宰治(新潮社)] 人間失格 上巻.zip")
                    .folder
                    .as_deref(),
                Some("太宰治(新潮社)")
            );
            assert_eq!(
                clf.classify("[芥川龍之介] 羅生門 (新潮社).zip")
                    .folder
                    .as_deref(),
                Some("芥川龍之介(新潮社)")
            );
            assert_eq!(
                clf.classify("[夏目漱石] 吾輩は猫である.txt")
                    .folder
                    .as_deref(),
                Some("夏目漱石")
            );
            assert_eq!(
                clf.classify("青赤黄作家 新作.zip").folder.as_deref(),
                Some("青赤黄作家(新潮社)")
            );
        }
        let elapsed = start.elapsed();
        // 200 件の判定（デバッグビルド）で 2 秒未満
        assert!(elapsed.as_secs_f64() < 2.0, "elapsed = {:?}", elapsed);
    }
}
