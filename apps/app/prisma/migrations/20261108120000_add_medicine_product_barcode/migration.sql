-- AlterTable
ALTER TABLE "medicines" ADD COLUMN     "product_barcode" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "medicines_product_barcode_key" ON "medicines"("product_barcode");

-- The scanner routes MED- and BAT- codes to the app's own barcodes, so a product code can't use them.
ALTER TABLE medicines ADD CONSTRAINT medicines_product_barcode_prefix
  CHECK (upper(product_barcode) NOT LIKE 'MED-%' AND upper(product_barcode) NOT LIKE 'BAT-%');
