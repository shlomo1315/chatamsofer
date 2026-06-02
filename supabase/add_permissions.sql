-- הוספת עמודת הרשאות לטבלת פרופילים
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS permissions JSONB DEFAULT '{}';
