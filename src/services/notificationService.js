const pool = require("../config/db");

const TABLE = "notifications";

async function getNotificationColumns(operation) {
  const relation = await pool.query(
    `SELECT namespace.nspname AS table_schema
     FROM pg_class AS relation
     JOIN pg_namespace AS namespace ON namespace.oid=relation.relnamespace
     WHERE relation.oid=to_regclass($1) AND relation.relkind IN ('r','p','v','m')`,
    [TABLE]
  );
  if (!relation.rows.length) {
    const error = new Error("Required notifications table was not found in the active search path");
    error.code = "NOTIFICATION_TABLE_MISSING";
    error.table = TABLE;
    error.operation = operation;
    throw error;
  }
  const tableSchema = relation.rows[0].table_schema;
  const { rows } = await pool.query(
    `SELECT column_name
     FROM information_schema.columns
     WHERE table_schema=$1 AND table_name=$2`,
    [tableSchema, TABLE]
  );
  const columns = new Set(rows.map((row) => row.column_name));
  return columns;
}

function quoteIdentifier(identifier) {
  return `"${identifier.replace(/"/g, '""')}"`;
}

function requireColumn(columns, candidates, operation) {
  const column = candidates.find((candidate) => columns.has(candidate));
  if (column) return column;
  const error = new Error(`Required notification column is missing; checked ${candidates.join(" or ")}`);
  error.code = "NOTIFICATION_COLUMN_MISSING";
  error.table = TABLE;
  error.column = candidates.join("|");
  error.operation = operation;
  throw error;
}

async function createPaymentSuccessNotification({ id, userId, bookingId, bookingCode }) {
  const operation = "create_payment_success_notification";
  const columns = await getNotificationColumns(operation);
  const textColumn = requireColumn(columns, ["content", "message"], operation);
  const userIdColumn = requireColumn(columns, ["user_id"], operation);
  const valuesByColumn = {
    id,
    user_id: userId,
    booking_id: bookingId,
    title: "Thanh to\u00e1n th\u00e0nh c\u00f4ng",
    [textColumn]: `\u0110\u1eb7t ph\u00f2ng ${bookingCode} \u0111\u00e3 \u0111\u01b0\u1ee3c x\u00e1c nh\u1eadn thanh to\u00e1n.`,
    type: "payment",
    created_at: new Date(),
  };
  const insertColumns = ["id", userIdColumn, "title", textColumn, "booking_id", "type", "created_at"]
    .filter((column, index, all) => columns.has(column) && all.indexOf(column) === index);
  const values = insertColumns.map((column) => valuesByColumn[column]);
  if (!insertColumns.includes(userIdColumn) || !insertColumns.includes(textColumn)) {
    const error = new Error("Notifications table is missing its user or message column");
    error.code = "NOTIFICATION_COLUMN_MISSING";
    error.table = TABLE;
    error.column = [userIdColumn, textColumn].filter((column) => !columns.has(column)).join("|");
    error.operation = operation;
    throw error;
  }
  const placeholders = values.map((_, index) => `$${index + 1}`);
  await pool.query(
    `INSERT INTO ${quoteIdentifier(TABLE)} (${insertColumns.map(quoteIdentifier).join(", ")})
     VALUES (${placeholders.join(", ")}) ON CONFLICT DO NOTHING`,
    values
  );
}

async function listNotificationsForUser(userId) {
  const operation = "list_user_notifications";
  const columns = await getNotificationColumns(operation);
  const userIdColumn = requireColumn(columns, ["user_id"], operation);
  const idColumn = columns.has("id") ? quoteIdentifier("id") : "NULL AS id";
  const bookingIdColumn = columns.has("booking_id") ? quoteIdentifier("booking_id") : "NULL AS booking_id";
  const titleColumn = columns.has("title") ? quoteIdentifier("title") : "NULL AS title";
  const messageColumn = requireColumn(columns, ["content", "message"], operation);
  const textColumn = messageColumn === "content"
    ? `${quoteIdentifier("content")} AS message`
    : quoteIdentifier("message");
  const typeColumn = columns.has("type") ? quoteIdentifier("type") : "NULL AS type";
  const createdAtColumn = columns.has("created_at") ? quoteIdentifier("created_at") : "NULL AS created_at";
  const readColumn = columns.has("is_read") ? quoteIdentifier("is_read") : "FALSE AS is_read";
  const { rows } = await pool.query(
    `SELECT ${idColumn},${quoteIdentifier(userIdColumn)} AS user_id,${bookingIdColumn},${titleColumn},
            ${textColumn},${typeColumn},${createdAtColumn},${readColumn}
     FROM ${quoteIdentifier(TABLE)}
     WHERE ${quoteIdentifier(userIdColumn)}=$1
     ORDER BY ${columns.has("created_at") ? quoteIdentifier("created_at") : quoteIdentifier(userIdColumn)} DESC`,
    [userId]
  );
  return rows;
}

module.exports = { createPaymentSuccessNotification, listNotificationsForUser };
