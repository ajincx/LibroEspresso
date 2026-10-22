// Source status controls whether new files may be imported. Once accepted, a
// non-test import remains part of historical accounting even if its source is
// later deactivated.
export const OPERATIONAL_POS_SOURCE_JOIN =
  "JOIN pos_sources source ON source.id=pi.pos_source_id";

export const OPERATIONAL_POS_IMPORT_CONDITION =
  "NOT pi.is_test_data AND pi.voided_at IS NULL";
