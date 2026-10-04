export const OPERATIONAL_POS_SOURCE_JOIN =
  "JOIN pos_sources source ON source.id=pi.pos_source_id AND source.status='ACTIVE'";

export const OPERATIONAL_POS_IMPORT_CONDITION = "NOT pi.is_test_data";
