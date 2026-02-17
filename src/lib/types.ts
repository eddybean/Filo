export type Action = "move" | "copy";

export type MatchType = "glob" | "regex";

export interface FilenameFilter {
  pattern: string;
  match_type: MatchType;
}

export interface DateTimeRange {
  start: string | null;
  end: string | null;
}

export interface Filters {
  extensions: string[] | null;
  filename: FilenameFilter | null;
  created_at: DateTimeRange | null;
  modified_at: DateTimeRange | null;
}

export interface Ruleset {
  id: string;
  name: string;
  enabled: boolean;
  source_dir: string;
  destination_dir: string;
  action: Action;
  overwrite: boolean;
  filters: Filters;
}

export type ExecutionStatus = "Completed" | "PartialFailure" | "Failed";

export interface FileResult {
  filename: string;
  source_path: string;
  destination_path: string | null;
  reason: string | null;
}

export interface ExecutionResult {
  ruleset_id: string;
  ruleset_name: string;
  action: Action;
  status: ExecutionStatus;
  succeeded: FileResult[];
  skipped: FileResult[];
  errors: FileResult[];
}

export interface UndoRequest {
  source_path: string;
  destination_path: string;
}
