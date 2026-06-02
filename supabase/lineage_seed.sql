-- Chatam Sofer lineage seed (auto-generated from CSV)
-- Generation computed from tree depth; CSV typos auto-corrected.
begin;
delete from lineage_nodes;

-- דור 1
insert into lineage_nodes (id, name, generation, parent_id) values ('562e9c51-b334-47c7-aafa-b15da1bcb48b', 'החתם סופר', 1, null);

-- דור 2
insert into lineage_nodes (id, name, generation, parent_id) values ('b8ba6b75-0f7a-4bef-aba4-5ca8f936c611', 'אברהם שמואל בנימין סופר', 2, '562e9c51-b334-47c7-aafa-b15da1bcb48b');
insert into lineage_nodes (id, name, generation, parent_id) values ('15c8cf69-1749-459c-a165-2c9bd0d6cb65', 'אליהו קורניצר', 2, '562e9c51-b334-47c7-aafa-b15da1bcb48b');
insert into lineage_nodes (id, name, generation, parent_id) values ('a8667eec-b91a-493e-b32b-d2321840e6bd', 'דוד צבי ארנפלד', 2, '562e9c51-b334-47c7-aafa-b15da1bcb48b');
insert into lineage_nodes (id, name, generation, parent_id) values ('e16c17d2-6952-4aa1-a7b6-e8756dc9020a', 'יוזף יוזפא סופר', 2, '562e9c51-b334-47c7-aafa-b15da1bcb48b');
insert into lineage_nodes (id, name, generation, parent_id) values ('1eaf537e-907b-4f94-b388-3c5b4fe01eb9', 'משה טוביה להמן', 2, '562e9c51-b334-47c7-aafa-b15da1bcb48b');
insert into lineage_nodes (id, name, generation, parent_id) values ('6828db74-8f31-40e3-adf3-4b96336a77ba', 'צבי יהודה פרידמן', 2, '562e9c51-b334-47c7-aafa-b15da1bcb48b');
insert into lineage_nodes (id, name, generation, parent_id) values ('83c2a7da-418d-4c23-85c2-265d7d6041bd', 'שלמה זלמן שפיצר', 2, '562e9c51-b334-47c7-aafa-b15da1bcb48b');
insert into lineage_nodes (id, name, generation, parent_id) values ('3a4cc38e-39ce-4913-90f8-759df524e1dc', 'שמעון סופר', 2, '562e9c51-b334-47c7-aafa-b15da1bcb48b');

-- דור 3
insert into lineage_nodes (id, name, generation, parent_id) values ('db2caa8c-c9b7-4219-ab9d-db72157eb49e', 'אברהם גלזנר', 3, 'a8667eec-b91a-493e-b32b-d2321840e6bd');
insert into lineage_nodes (id, name, generation, parent_id) values ('793ca7d7-af01-45ac-bcbd-40592b06c706', 'אשר סופר', 3, '3a4cc38e-39ce-4913-90f8-759df524e1dc');
insert into lineage_nodes (id, name, generation, parent_id) values ('cc372750-3252-4547-b922-607b08b33cf8', 'יהודה גרינוולד', 3, 'e16c17d2-6952-4aa1-a7b6-e8756dc9020a');
insert into lineage_nodes (id, name, generation, parent_id) values ('a9f87079-eeaf-4051-883d-05f09c9ef806', 'יואל סופר', 3, '3a4cc38e-39ce-4913-90f8-759df524e1dc');
insert into lineage_nodes (id, name, generation, parent_id) values ('c0b57903-ba88-4369-a41b-53ad11fb4be3', 'יוסף דוב קהאן', 3, '15c8cf69-1749-459c-a165-2c9bd0d6cb65');
insert into lineage_nodes (id, name, generation, parent_id) values ('ef3e37a3-2204-48e9-b478-0cf253aeaf0b', 'יוסף עקיבא להמן', 3, '1eaf537e-907b-4f94-b388-3c5b4fe01eb9');
insert into lineage_nodes (id, name, generation, parent_id) values ('4a0d0d64-5bc7-4087-99c8-97e4595d4ec0', 'יעקב יהודה שטרסר', 3, 'b8ba6b75-0f7a-4bef-aba4-5ca8f936c611');
insert into lineage_nodes (id, name, generation, parent_id) values ('636c6e46-6579-485e-abeb-d3c7b6179169', 'יעקב עקיבא סופר', 3, 'b8ba6b75-0f7a-4bef-aba4-5ca8f936c611');
insert into lineage_nodes (id, name, generation, parent_id) values ('05480726-bc2b-40e4-820f-d0115c744d80', 'יצחק לייב סופר', 3, 'b8ba6b75-0f7a-4bef-aba4-5ca8f936c611');
insert into lineage_nodes (id, name, generation, parent_id) values ('5dcd42a0-6ded-44a0-83ce-34ff8d5d8c25', 'ישעיה ארנפלד', 3, 'a8667eec-b91a-493e-b32b-d2321840e6bd');
insert into lineage_nodes (id, name, generation, parent_id) values ('f4775888-c1e8-47b4-b06c-4668c5948fea', 'ישראל דוד שמחה סופר', 3, '3a4cc38e-39ce-4913-90f8-759df524e1dc');
insert into lineage_nodes (id, name, generation, parent_id) values ('72a32cfb-fdc1-44af-b1d9-4026c1aeffc0', 'משה סופר', 3, 'b8ba6b75-0f7a-4bef-aba4-5ca8f936c611');
insert into lineage_nodes (id, name, generation, parent_id) values ('bb5483ed-99de-4095-9c24-35e51b8572e8', 'משה שרגא גולדשטיין', 3, '1eaf537e-907b-4f94-b388-3c5b4fe01eb9');
insert into lineage_nodes (id, name, generation, parent_id) values ('0dd03f91-bbab-4791-bb08-dafb3066778e', 'עקיבא סופר (פאפא)', 3, '3a4cc38e-39ce-4913-90f8-759df524e1dc');
insert into lineage_nodes (id, name, generation, parent_id) values ('91ef2e8f-0546-4266-b679-4d0e56f3be7c', 'עקיבא קורניצר', 3, '3a4cc38e-39ce-4913-90f8-759df524e1dc');
insert into lineage_nodes (id, name, generation, parent_id) values ('16ab4b1a-cdd1-4045-8975-3af4d92ebd5a', 'עקיבא קורניצר', 3, '15c8cf69-1749-459c-a165-2c9bd0d6cb65');
insert into lineage_nodes (id, name, generation, parent_id) values ('fc774c74-957e-41cf-a80c-a9f412f42ba3', 'שאול ארנפלד', 3, 'a8667eec-b91a-493e-b32b-d2321840e6bd');
insert into lineage_nodes (id, name, generation, parent_id) values ('a413fe83-b03f-42ac-b417-034aa3ee722a', 'שלום בר שטרן', 3, 'a8667eec-b91a-493e-b32b-d2321840e6bd');
insert into lineage_nodes (id, name, generation, parent_id) values ('433098a0-0bae-4ad7-b8d5-642764780927', 'שלמה אלכסנדרי סופר', 3, '3a4cc38e-39ce-4913-90f8-759df524e1dc');
insert into lineage_nodes (id, name, generation, parent_id) values ('32e868a2-e681-46a4-98f0-034d82a6a4a8', 'שלמה סופר', 3, 'b8ba6b75-0f7a-4bef-aba4-5ca8f936c611');
insert into lineage_nodes (id, name, generation, parent_id) values ('709efd5d-2b50-4a2e-9fa5-7f1f60722a65', 'שמואל ארנפלד', 3, 'a8667eec-b91a-493e-b32b-d2321840e6bd');
insert into lineage_nodes (id, name, generation, parent_id) values ('3f32dcee-12da-483f-b8c2-54ef76e1c835', 'שמחה בונם סופר', 3, 'b8ba6b75-0f7a-4bef-aba4-5ca8f936c611');
insert into lineage_nodes (id, name, generation, parent_id) values ('07d064cf-4bb7-4b3e-885b-5658466f59bf', 'שמעון ארנפלד', 3, 'a8667eec-b91a-493e-b32b-d2321840e6bd');
insert into lineage_nodes (id, name, generation, parent_id) values ('1f261097-fda1-4a42-b8cd-6caed7e33b41', 'שמעון סופר', 3, '83c2a7da-418d-4c23-85c2-265d7d6041bd');
insert into lineage_nodes (id, name, generation, parent_id) values ('053a46ca-f6b4-4ca1-97c6-219c7d02196b', 'שמעון סופר (התעוררות תשובה)', 3, 'b8ba6b75-0f7a-4bef-aba4-5ca8f936c611');

-- דור 4
insert into lineage_nodes (id, name, generation, parent_id) values ('0c52b4ab-6e4d-486c-b57e-1e0a9c6670a5', 'אברהם חיים דוד סופר', 4, '05480726-bc2b-40e4-820f-d0115c744d80');
insert into lineage_nodes (id, name, generation, parent_id) values ('d373ded2-bed0-4a20-8596-97d46b3f654b', 'אברהם סופר', 4, '053a46ca-f6b4-4ca1-97c6-219c7d02196b');
insert into lineage_nodes (id, name, generation, parent_id) values ('f84f041c-c6a7-4d66-b6f5-56fa6d6df7d5', 'אברהם פרוידיגר', 4, '05480726-bc2b-40e4-820f-d0115c744d80');
insert into lineage_nodes (id, name, generation, parent_id) values ('9afdb7b9-4c9b-4540-9189-3a38154aedbd', 'אליהו כץ', 4, '32e868a2-e681-46a4-98f0-034d82a6a4a8');
insert into lineage_nodes (id, name, generation, parent_id) values ('b969f5b0-e36f-40d3-b7e3-ab9938894c2f', 'בנימין זיידל', 4, 'a413fe83-b03f-42ac-b417-034aa3ee722a');
insert into lineage_nodes (id, name, generation, parent_id) values ('d01cb6a5-7bd4-4b52-bfe8-d99616c423e3', 'דוד צבי ארנפלד', 4, '709efd5d-2b50-4a2e-9fa5-7f1f60722a65');
insert into lineage_nodes (id, name, generation, parent_id) values ('a4aecc32-bdd2-46ba-a4d6-c755211cb5fb', 'זאב פרנקל', 4, '053a46ca-f6b4-4ca1-97c6-219c7d02196b');
insert into lineage_nodes (id, name, generation, parent_id) values ('6e5651b2-c2e5-401a-bf2b-049ed2918b68', 'זלמן סופר', 4, '053a46ca-f6b4-4ca1-97c6-219c7d02196b');
insert into lineage_nodes (id, name, generation, parent_id) values ('04aa8b1f-6081-4ac6-ade9-28c886ca8f8b', 'יהודה צבי בלום', 4, '5dcd42a0-6ded-44a0-83ce-34ff8d5d8c25');
insert into lineage_nodes (id, name, generation, parent_id) values ('8e480f04-5462-4e64-ad1d-62e371b1cbda', 'יונתן שטרסר', 4, '4a0d0d64-5bc7-4087-99c8-97e4595d4ec0');
insert into lineage_nodes (id, name, generation, parent_id) values ('a4c8338c-e759-4b75-8689-d0233a5d0c4f', 'יוסף בוימגרטן', 4, 'a413fe83-b03f-42ac-b417-034aa3ee722a');
insert into lineage_nodes (id, name, generation, parent_id) values ('0a7c0c21-1307-4501-8a05-701aa3357845', 'יוסף נחמיה קורניצר', 4, '91ef2e8f-0546-4266-b679-4d0e56f3be7c');
insert into lineage_nodes (id, name, generation, parent_id) values ('8b5f35c9-1463-4b50-920a-d97940ce36ea', 'יוסף נפתלי שטרן', 4, '433098a0-0bae-4ad7-b8d5-642764780927');
insert into lineage_nodes (id, name, generation, parent_id) values ('fd627fad-8a04-4bb0-9763-bfe82c82d337', 'יצחק צבי ליבוביץ', 4, '5dcd42a0-6ded-44a0-83ce-34ff8d5d8c25');
insert into lineage_nodes (id, name, generation, parent_id) values ('f6260eda-96f8-4ddb-973d-84ae4b44560f', 'מאיר לייב פרייא', 4, '5dcd42a0-6ded-44a0-83ce-34ff8d5d8c25');
insert into lineage_nodes (id, name, generation, parent_id) values ('374f5ddb-607f-4939-a7a2-d9582167c778', 'משה דייטש', 4, '053a46ca-f6b4-4ca1-97c6-219c7d02196b');
insert into lineage_nodes (id, name, generation, parent_id) values ('7c83e019-4d8a-47e3-a5ca-51d3cbd641ac', 'משה סופר', 4, '053a46ca-f6b4-4ca1-97c6-219c7d02196b');
insert into lineage_nodes (id, name, generation, parent_id) values ('6534fe0b-eec9-49bc-90b8-c5c458a99444', 'משה סופר', 4, 'a9f87079-eeaf-4051-883d-05f09c9ef806');
insert into lineage_nodes (id, name, generation, parent_id) values ('c17603e9-3ea4-4dec-be50-2b44189ee971', 'משה שמואל גלזנר', 4, 'db2caa8c-c9b7-4219-ab9d-db72157eb49e');
insert into lineage_nodes (id, name, generation, parent_id) values ('065b0ba0-9e0f-4472-b8a9-76a1a24da99b', 'נתן יהודה סופר', 4, '636c6e46-6579-485e-abeb-d3c7b6179169');
insert into lineage_nodes (id, name, generation, parent_id) values ('577f9edf-8957-463c-9b7d-f20b5738002a', 'עקיבא סופר (דעת סופר)', 4, '3f32dcee-12da-483f-b8c2-54ef76e1c835');
insert into lineage_nodes (id, name, generation, parent_id) values ('57527840-19dc-4141-ace7-343f6ed43446', 'עקיבא סופר (מסטניסלב)', 4, '053a46ca-f6b4-4ca1-97c6-219c7d02196b');
insert into lineage_nodes (id, name, generation, parent_id) values ('d1e2c829-a732-4e0a-b796-f454ff50d8c2', 'עקיבא שטרסר', 4, '4a0d0d64-5bc7-4087-99c8-97e4595d4ec0');
insert into lineage_nodes (id, name, generation, parent_id) values ('c4c0dee2-c4bb-4208-9f94-274db0a45745', 'עקיבא שלזינגר', 4, '4a0d0d64-5bc7-4087-99c8-97e4595d4ec0');
insert into lineage_nodes (id, name, generation, parent_id) values ('662669fc-5eb8-4240-b4e4-50963084816d', 'קלמן וובר', 4, 'c0b57903-ba88-4369-a41b-53ad11fb4be3');
insert into lineage_nodes (id, name, generation, parent_id) values ('7badf668-d0eb-4eff-a13f-18b7b1b7a03b', 'שלמה זלמן אולמן', 4, '05480726-bc2b-40e4-820f-d0115c744d80');
insert into lineage_nodes (id, name, generation, parent_id) values ('9f5bd844-24ad-451e-b7b0-da4b2c886ab7', 'שלמה סופר', 4, '636c6e46-6579-485e-abeb-d3c7b6179169');
insert into lineage_nodes (id, name, generation, parent_id) values ('53f17a13-4c25-4cfc-a8ae-97fe533a0759', 'שמואל ארנפלד', 4, 'fc774c74-957e-41cf-a80c-a9f412f42ba3');
insert into lineage_nodes (id, name, generation, parent_id) values ('210681c6-025c-4a1c-8053-3700ca59e4a5', 'שמואל בנימין סופר', 4, '05480726-bc2b-40e4-820f-d0115c744d80');
insert into lineage_nodes (id, name, generation, parent_id) values ('91848dbb-af31-42f3-9d84-20df05f4e2d1', 'שמואל חיים סופר', 4, '053a46ca-f6b4-4ca1-97c6-219c7d02196b');
insert into lineage_nodes (id, name, generation, parent_id) values ('462273bf-d736-453a-a33a-bf8a358255cc', 'שמחה בונם ארנפלד', 4, '709efd5d-2b50-4a2e-9fa5-7f1f60722a65');

commit;