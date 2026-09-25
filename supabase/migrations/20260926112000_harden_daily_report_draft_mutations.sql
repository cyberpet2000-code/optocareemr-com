-- Harden remaining daily front-desk draft mutations to the canonical membership/lifecycle model.
-- Replaces legacy clinic_users authorization while preserving exact signatures and workflow.
-- Functions: save_daily_front_desk_report, save_daily_front_desk_report_item,
-- save_daily_front_desk_activity, save_daily_front_desk_report_feedback_note.

-- The live SQL migration contains the exact function replacements applied to production.