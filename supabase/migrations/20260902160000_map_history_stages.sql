-- Map the original 50 imported rate points to catalogue stages so past
-- quotes can drive suggestions (UPDATE_VARIABLES_CASH.md section 6). Mapping
-- is by the observed line's nature; rows with no sensible stage stay null.

-- Tiling installation rates
update imported_quotes set
  stage_id = (select id from stages where discipline = 'Tiling & marble' and name like 'Adhesive%')
where stage_id is null and (stage_name ilike '%tile install%' or stage_name ilike '%tile with adhesive%');

-- Grout: epoxy grout rates to the epoxy grout stage, generic grout to cementitious
update imported_quotes set
  stage_id = (select id from stages where discipline = 'Tiling & marble' and name = 'Epoxy grout')
where stage_id is null and stage_name ilike '%epoxy grout%';
update imported_quotes set
  stage_id = (select id from stages where discipline = 'Tiling & marble' and name = 'Cementitious grout')
where stage_id is null and (stage_name ilike '%grout and se%' or stage_name ilike '%fugabella%');
update imported_quotes set
  stage_id = (select id from stages where discipline = 'Tiling & marble' and name like 'Grout removal%')
where stage_id is null and stage_name ilike '%grout removal%' or (stage_id is null and stage_name ilike '%removal of existing grout%');

-- Self-levelling and screed
update imported_quotes set
  stage_id = (select id from stages where discipline = 'SL & screed' and name like 'Self-levelling compound%')
where stage_id is null and stage_name ilike '%self-level%';
update imported_quotes set
  stage_id = (select id from stages where discipline = 'SL & screed' and name like 'Cementitious screed%')
where stage_id is null and stage_name ilike '%screed%';

-- Liquid waterproofing systems
update imported_quotes set
  stage_id = (select id from stages where discipline = 'Waterproofing' and name like 'Membrane coat 1%')
where stage_id is null and (
  stage_name ilike '%waterproofing%' or stage_name ilike '%mapelastic%'
  or stage_name ilike '%purtop%' or stage_name ilike '%cm210%' or stage_name ilike '%cementitious wp%'
);

-- Bitumen rolls
update imported_quotes set
  stage_id = (select id from stages where discipline = 'Bitumen WP' and name like 'Torch-applied membrane layer 1%')
where stage_id is null and (stage_name ilike '%sbs membrane%' or stage_name ilike '%anti-root%');
update imported_quotes set
  stage_id = (select id from stages where discipline = 'Bitumen WP' and name = 'Protection board')
where stage_id is null and stage_name ilike '%protection board%';
update imported_quotes set
  stage_id = (select id from stages where discipline = 'Bitumen WP' and name = 'Bituminous primer')
where stage_id is null and stage_name ilike '%water-based primer%';

-- Epoxy floors
update imported_quotes set
  stage_id = (select id from stages where discipline = 'Epoxy flooring' and name like 'Body coat%')
where stage_id is null and stage_name ilike '%epoxy flooring%';
update imported_quotes set
  stage_id = (select id from stages where discipline = 'Epoxy flooring' and name like 'Shotblast%')
where stage_id is null and stage_name ilike '%grinding%';

-- Sealants and insulation
update imported_quotes set
  stage_id = (select id from stages where discipline = 'Sealants' and name like 'Sealant gun-applied%')
where stage_id is null and stage_name ilike '%pu45%';
update imported_quotes set
  stage_id = (select id from stages where discipline = 'Insulation' and name like 'EPS / XPS%')
where stage_id is null and stage_name ilike '%xps%';

-- Kerakoll decorative application-only rates to the microtopping finish stage
update imported_quotes set
  stage_id = (select id from stages where discipline = 'Microtopping' and name like 'Finish coat%')
where stage_id is null and (stage_name ilike '%kerakoll%' or stage_name ilike '%microresina%' or stage_name ilike '%wallcrete%');

-- Application-only detection reads notes; make the flag explicit where the
-- line name carries it
update imported_quotes set notes = trim(both ' ' from coalesce(notes, '') || ' Application only')
where (stage_name ilike '%application onl%' or stage_name ilike '%labour only%')
  and coalesce(notes, '') not ilike '%application only%';
