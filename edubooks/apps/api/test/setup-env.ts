// Point everything at the dedicated test database before any module reads config.
process.env.DATABASE_OWNER_URL = process.env.TEST_DATABASE_OWNER_URL || 'postgres://edubooks:edubooks@localhost:5432/edubooks_test';
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL || 'postgres://edubooks_app:edubooks_app@localhost:5432/edubooks_test';
process.env.STORAGE_DIR = require('path').join(require('os').tmpdir(), 'edubooks-test-storage');
process.env.LOGIN_RATE_LIMIT = '1000';
process.env.FILE_URL_TTL_SEC = '60';
process.env.NODE_ENV = 'test';
