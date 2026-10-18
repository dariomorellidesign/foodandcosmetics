CREATE TABLE diet_ingredients (id TEXT PRIMARY KEY, data_json TEXT NOT NULL);

CREATE TABLE metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL);

CREATE TABLE products (
 type TEXT NOT NULL, id TEXT NOT NULL, barcode TEXT, barcode_roundtrip_ok INTEGER NOT NULL,
 barcode_check_digit_valid INTEGER, name TEXT, brand TEXT, category TEXT, grade INTEGER, updated TEXT,
 image_relative_path TEXT, source_photo TEXT, calories REAL, sugar REAL, saturated_fat REAL, sodium REAL,
 proteins REAL, fibers REAL, fat REAL, bio INTEGER, ingredients_json TEXT, additives_json TEXT,
 data_json TEXT NOT NULL, PRIMARY KEY(type,id));

CREATE TABLE reference_records (table_name TEXT NOT NULL, id TEXT NOT NULL, data_json TEXT NOT NULL, PRIMARY KEY(table_name,id));

CREATE INDEX products_barcode ON products(barcode);

CREATE INDEX products_brand ON products(brand);

CREATE INDEX products_category ON products(category);

CREATE INDEX products_grade ON products(grade);
