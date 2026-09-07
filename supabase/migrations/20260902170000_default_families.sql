-- Link default product families where stages had none, so a freshly added
-- line prices material immediately (UPDATE_VARIABLES_CASH.md section 2).
-- Microtopping was the reported failure; the SL, screed and repair stages had
-- the same gap. Families live under the Decorative concrete alias discipline.

update stages set default_family_id =
  (select id from product_families where name like 'Mapei Ultratop Loft F%' limit 1)
where discipline = 'Microtopping' and name like 'Base coat%' and default_family_id is null;

update stages set default_family_id =
  (select id from product_families where name like 'Mapei Ultratop Loft W%' limit 1)
where discipline = 'Microtopping' and name like 'Finish coat%' and default_family_id is null;

update stages set default_family_id =
  (select id from product_families where name like 'Kerakoll Universal Wall Primer%' limit 1)
where discipline = 'Microtopping' and name like 'Bond test%' and default_family_id is null;

update stages set default_family_id =
  (select id from product_families where name like 'Mapei Mapefloor Finish 58 W%' limit 1)
where discipline = 'Microtopping' and name like 'PU sealer%' and default_family_id is null;

update stages set default_family_id =
  (select id from product_families where name = 'Mapei Ultraplan Eco 20 (23 kg)' limit 1)
where discipline = 'SL & screed' and name like 'Self-levelling compound%' and default_family_id is null;

update stages set default_family_id =
  (select id from product_families where name = 'Mapei Topcem (20 kg binder)' limit 1)
where discipline = 'SL & screed' and name like 'Cementitious screed%' and default_family_id is null;

update stages set default_family_id =
  (select id from product_families where name like 'Mapei Mapegrout Thixotropic%' limit 1)
where discipline = 'Repair' and name like 'Repair mortar%' and default_family_id is null;

update stages set default_family_id =
  (select id from product_families where name like 'Mapei Eporip%' limit 1)
where discipline = 'Repair' and name like 'Crack injection%' and default_family_id is null;

update stages set default_family_id =
  (select id from product_families where name like 'Mapei Ultratop Standard%' limit 1)
where discipline = 'Design concrete' and name ilike '%ultratop%' and default_family_id is null;
