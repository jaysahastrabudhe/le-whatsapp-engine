-- Migration: add persona-based fallback subtree to Logic Builder graph
-- Replaces the dumb "c8 false → a7 (wa_welcome_manual)" terminal with:
--   c8 false → cP (persona contains "Parent"?)
--     cP true  → aManualParent  (wa_welcome_manual)
--     cP false → aManualStudent (wa_welcome_manual — assumes student when persona null)

UPDATE workflow_rules
SET
  conditions_json = '[
    {"id":"t1","type":"triggerNode","data":{"label":"State: wa_pending","state":"wa_pending"},"position":{"x":0,"y":0}},
    {"id":"c1","type":"conditionNode","data":{"field":"program","label":"program == Storysells","value":"Storysells"},"position":{"x":0,"y":100}},
    {"id":"c2","type":"conditionNode","data":{"field":"relocate_to_pune","label":"relocate_to_pune == No","value":"No"},"position":{"x":0,"y":200}},
    {"id":"e2","type":"endNode","data":{"label":"Manual triage – won'\''t relocate"},"position":{"x":300,"y":200}},
    {"id":"c3","type":"conditionNode","data":{"field":"academic_level","label":"academic_level == 10th","value":"10th"},"position":{"x":0,"y":300}},
    {"id":"e3","type":"endNode","data":{"label":"Skip – low urgency"},"position":{"x":300,"y":300}},
    {"id":"c4","type":"conditionNode","data":{"field":"lead_source","label":"lead_source == Meta","value":"Meta"},"position":{"x":0,"y":400}},
    {"id":"c5","type":"conditionNode","data":{"field":"persona","label":"persona == Student","value":"Student"},"position":{"x":300,"y":400}},
    {"id":"a1","type":"actionNode","data":{"label":"Send Template: wa_welcome_meta_student","templateName":"wa_welcome_meta_student"},"position":{"x":600,"y":350}},
    {"id":"a2","type":"actionNode","data":{"label":"Send Template: wa_welcome_meta_parent","templateName":"wa_welcome_meta_parent"},"position":{"x":600,"y":450}},
    {"id":"c6","type":"conditionNode","data":{"field":"lead_source","label":"lead_source == Organic","value":"Organic"},"position":{"x":0,"y":500}},
    {"id":"c7","type":"conditionNode","data":{"field":"persona","label":"persona == Student","value":"Student"},"position":{"x":300,"y":500}},
    {"id":"a3","type":"actionNode","data":{"label":"Send Template: wa_welcome_organic_student","templateName":"wa_welcome_organic_student"},"position":{"x":600,"y":450}},
    {"id":"a4","type":"actionNode","data":{"label":"Send Template: wa_welcome_organic_parent","templateName":"wa_welcome_organic_parent"},"position":{"x":600,"y":550}},
    {"id":"c8","type":"conditionNode","data":{"field":"lead_source","label":"lead_source == Website","value":"Website"},"position":{"x":0,"y":600}},
    {"id":"c9","type":"conditionNode","data":{"field":"persona","label":"persona == Student","value":"Student"},"position":{"x":300,"y":600}},
    {"id":"a5","type":"actionNode","data":{"label":"Send Template: wa_welcome_organic_student","templateName":"wa_welcome_organic_student"},"position":{"x":600,"y":550}},
    {"id":"a6","type":"actionNode","data":{"label":"Send Template: wa_welcome_organic_parent","templateName":"wa_welcome_organic_parent"},"position":{"x":600,"y":650}},
    {"id":"cP","type":"conditionNode","data":{"field":"persona","label":"persona == Parent","value":"Parent"},"position":{"x":0,"y":700}},
    {"id":"aManualParent","type":"actionNode","data":{"label":"Send Template: wa_welcome_manual","templateName":"wa_welcome_manual"},"position":{"x":300,"y":650}},
    {"id":"aManualStudent","type":"actionNode","data":{"label":"Send Template: wa_welcome_manual","templateName":"wa_welcome_manual"},"position":{"x":300,"y":750}},
    {"id":"1774495653674","type":"actionNode","data":{"label":"Send Template: wa_welcome_manual","templateName":"wa_welcome_manual"},"position":{"x":300,"y":100}}
  ]'::jsonb,
  actions_json = '[
    {"id":"e-t1-c1","source":"t1","target":"c1","sourceHandle":null},
    {"id":"e-c1-f-c2","source":"c1","target":"c2","sourceHandle":"false"},
    {"id":"e-c1-t-s","source":"c1","target":"1774495653674","sourceHandle":"true"},
    {"id":"e-c2-t-e2","source":"c2","target":"e2","sourceHandle":"true"},
    {"id":"e-c2-f-c3","source":"c2","target":"c3","sourceHandle":"false"},
    {"id":"e-c3-t-e3","source":"c3","target":"e3","sourceHandle":"true"},
    {"id":"e-c3-f-c4","source":"c3","target":"c4","sourceHandle":"false"},
    {"id":"e-c4-t-c5","source":"c4","target":"c5","sourceHandle":"true"},
    {"id":"e-c5-t-a1","source":"c5","target":"a1","sourceHandle":"true"},
    {"id":"e-c5-f-a2","source":"c5","target":"a2","sourceHandle":"false"},
    {"id":"e-c4-f-c6","source":"c4","target":"c6","sourceHandle":"false"},
    {"id":"e-c6-t-c7","source":"c6","target":"c7","sourceHandle":"true"},
    {"id":"e-c7-t-a3","source":"c7","target":"a3","sourceHandle":"true"},
    {"id":"e-c7-f-a4","source":"c7","target":"a4","sourceHandle":"false"},
    {"id":"e-c6-f-c8","source":"c6","target":"c8","sourceHandle":"false"},
    {"id":"e-c8-t-c9","source":"c8","target":"c9","sourceHandle":"true"},
    {"id":"e-c9-t-a5","source":"c9","target":"a5","sourceHandle":"true"},
    {"id":"e-c9-f-a6","source":"c9","target":"a6","sourceHandle":"false"},
    {"id":"e-c8-f-cP","source":"c8","target":"cP","sourceHandle":"false"},
    {"id":"e-cP-t-aMP","source":"cP","target":"aManualParent","sourceHandle":"true"},
    {"id":"e-cP-f-aMS","source":"cP","target":"aManualStudent","sourceHandle":"false"}
  ]'::jsonb,
  version = version + 1,
  published_at = now()
WHERE id = '00000000-0000-0000-0000-000000000001';
