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

pub fn normalize(_s: &str) -> String {
    unimplemented!()
}

pub fn tokenize(_s: &str) -> Vec<String> {
    unimplemented!()
}

pub struct Classifier {}

impl Classifier {
    pub fn new(_folders: &[String]) -> Self {
        unimplemented!()
    }

    pub fn classify(&self, _filename: &str) -> ClassifyResult {
        unimplemented!()
    }
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
        assert_eq!(tokenize("宮澤賢治_銀河鉄道の夜"), vec!["宮沢賢治", "銀河鉄道の夜"]);
        assert_eq!(tokenize("【東野圭吾】「容疑者」"), vec!["東野圭吾", "容疑者"]);
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
                clf.classify("[夏目漱石] 吾輩は猫である.txt").folder.as_deref(),
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
