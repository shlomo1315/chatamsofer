-- אינדקס לייעול מיזוג צמתים כפולים (עדכון lineage_node_id של נרשמים המשויכים לצומת)
create index if not exists idx_beneficiaries_lineage_node_id on beneficiaries(lineage_node_id);
