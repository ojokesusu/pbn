-- Audit G3: add an encrypted column for the server FTP/control-panel password.
--
-- Server.password was stored in plaintext. We now write AES-256-GCM ciphertext to
-- Server.passwordEnc. The legacy plaintext `password` column is KEPT for now as a
-- read fallback so existing rows keep deploying until they are re-encrypted with
--   node scripts/encrypt-server-passwords.mjs --apply   (needs PROVISION_PASSWORD_KEY)
-- Once every row has passwordEnc, a later migration can drop `password`.
--
-- AlterTable
ALTER TABLE "pbn"."Server" ADD COLUMN "passwordEnc" TEXT NOT NULL DEFAULT '';
