const XLSX = require("xlsx");
const path = require("path");
require("dotenv").config();
const { Pool } = require("pg");

const pool = new Pool({
    host: "dpg-db30tlm0tbcc738b9ogg-a.singapore-postgres.render.com",
    port: 5432,
    database: "hotel_booking_ferq",
    user: "hotel_booking_user",
    password: process.env.RENDER_DB_PASSWORD,
    ssl: {
        rejectUnauthorized: false
    }
});

const filePath = path.join(__dirname, "HOTEL_BOOKING.xlsx");

let workbook;
let client;
let transactionStarted = false;

// ==========================================
// 1. CHUYỂN ĐỔI NGÀY THÁNG EXCEL
// ==========================================
function excelDateToDate(value) {
    if (value === null || value === undefined || value === "") {
        return null;
    }

    if (typeof value === "number") {
        const excelEpoch = Date.UTC(1899, 11, 30);
        const date = new Date(
            excelEpoch + value * 24 * 60 * 60 * 1000
        );

        return date.toISOString().split("T")[0];
    }

    if (value instanceof Date) {
        return value.toISOString().split("T")[0];
    }

    const parsed = new Date(value);

    if (!isNaN(parsed.getTime())) {
        return parsed.toISOString().split("T")[0];
    }

    return value;
}

// ==========================================
// 2. CHUẨN HÓA TRẠNG THÁI
// ==========================================
function normalizeStatus(value) {
    if (value === null || value === undefined || value === "") {
        return "active";
    }

    return String(value).trim().toLowerCase();
}

// ==========================================
// 3. ĐỌC DỮ LIỆU TỪ SHEET
// ==========================================
function getRows(sheetName) {
    const worksheet = workbook.Sheets[sheetName];

    if (!worksheet) {
        throw new Error(`Không tìm thấy sheet: ${sheetName}`);
    }

    return XLSX.utils.sheet_to_json(worksheet, {
        defval: null
    });
}

// ==========================================
// 4. IMPORT VÀ THỐNG KÊ
// Chỉ thêm bản ghi chưa tồn tại.
// Không cập nhật hoặc xóa dữ liệu cũ.
// ==========================================
async function importRows(config) {
    const {
        label,
        sheet,
        table,
        columns,
        values
    } = config;

    const rows = getRows(sheet);

    let inserted = 0;
    let skipped = 0;

    for (const row of rows) {
        // Bỏ qua dòng hoàn toàn không có ID.
        // Với bảng liên kết, kiểm tra khóa chính tương ứng.
        const params = values(row);

        if (params.some(value => value === undefined)) {
            throw new Error(
                `Dữ liệu undefined tại sheet ${sheet}, bảng ${table}`
            );
        }

        const placeholders = params
            .map((_, index) => `$${index + 1}`)
            .join(", ");

        const sql = `
            INSERT INTO ${table} (${columns.join(", ")})
            VALUES (${placeholders})
            ON CONFLICT DO NOTHING
        `;

        const result = await client.query(sql, params);

        if (result.rowCount === 1) {
            inserted++;
        } else {
            skipped++;
        }
    }

    console.log(
        `✓ ${label}: tổng ${rows.length} dòng | ` +
        `thêm mới ${inserted} | bỏ qua ${skipped}`
    );
}

// ==========================================
// 5. CHẠY IMPORT
// ==========================================
async function importData() {
    try {
        console.log("========================================");
        console.log("  HOTEL BOOKING - IMPORT DỮ LIỆU MỚI");
        console.log("========================================");

        // Kiểm tra file Excel
        console.log("\n[1] Đang đọc file Excel...");

        workbook = XLSX.readFile(filePath);

        console.log(`Tìm thấy ${workbook.SheetNames.length} sheet.`);

        if (workbook.SheetNames.length !== 17) {
            throw new Error(
                `File Excel cần có 17 sheet, hiện có ` +
                `${workbook.SheetNames.length} sheet.`
            );
        }


        client = await pool.connect();

        const dbInfo = await client.query(`
            SELECT
                current_database() AS database_name,
                current_user AS username
        `);

        const databaseName = dbInfo.rows[0].database_name;

        console.log("\n[2] Đã kết nối PostgreSQL.");
        console.log(`Database: ${databaseName}`);
        console.log(`User: ${dbInfo.rows[0].username}`);

        if (databaseName !== "hotel_booking_ferq") {
            throw new Error(
                `Đang kết nối database "${databaseName}", ` +
                `không phải "hotel_booking_ferq". Đã dừng import.`
            );
        }

        await client.query("BEGIN");
        transactionStarted = true;

        console.log("\n[3] Bắt đầu import dữ liệu...\n");

        // ======================================
        // 1. HOTELS
        // ======================================
        await importRows({
            label: "Hotels",
            sheet: "02_hotels",
            table: "hotels",
            columns: [
                "id",
                "name",
                "description",
                "address",
                "city",
                "star_rating",
                "created_at"
            ],
            values: row => [
                row.id,
                row.name,
                row.description,
                row.address,
                row.city,
                row.star_rating,
                excelDateToDate(row.created_at)
            ]
        });

        // ======================================
        // 2. HOTEL IMAGES
        // ======================================
        await importRows({
            label: "Hotel Images",
            sheet: "03_hotel_images",
            table: "hotel_images",
            columns: [
                "id",
                "hotel_id",
                "image_url",
                "ordering"
            ],
            values: row => [
                row.id,
                row.hotel_id,
                row.image_url,
                row.ordering
            ]
        });

        // ======================================
        // 3. AMENITIES
        // ======================================
        await importRows({
            label: "Amenities",
            sheet: "04_amenities",
            table: "amenities",
            columns: [
                "id",
                "name",
                "description"
            ],
            values: row => [
                row.id,
                row.name,
                row.description
            ]
        });

        // ======================================
        // 4. HOTEL AMENITIES
        // ======================================
        await importRows({
            label: "Hotel Amenities",
            sheet: "05_hotel_amenities",
            table: "hotel_amenities",
            columns: [
                "hotel_id",
                "amenity_id"
            ],
            values: row => [
                row.hotel_id,
                row.amenity_id
            ]
        });

        // ======================================
        // 5. VIBE TAGS
        // ======================================
        await importRows({
            label: "Vibe Tags",
            sheet: "06_vibe_tags",
            table: "vibe_tags",
            columns: [
                "id",
                "name",
                "description"
            ],
            values: row => [
                row.id,
                row.name,
                row.description
            ]
        });

        // ======================================
        // 6. HOTEL VIBES
        // ======================================
        await importRows({
            label: "Hotel Vibes",
            sheet: "07_hotel_vibes",
            table: "hotel_vibes",
            columns: [
                "hotel_id",
                "vibe_id"
            ],
            values: row => [
                row.hotel_id,
                row.vibe_id
            ]
        });

        // ======================================
        // 7. ROOM TYPES
        // ======================================
        await importRows({
            label: "Room Types",
            sheet: "08_room_types",
            table: "room_types",
            columns: [
                "id",
                "hotel_id",
                "name",
                "description",
                "max_guests",
                "base_price"
            ],
            values: row => [
                row.id,
                row.hotel_id,
                row.name,
                row.description,
                row.max_guests,
                row.base_price
            ]
        });

        // ======================================
        // 8. ROOMS
        // ======================================
        await importRows({
            label: "Rooms",
            sheet: "09_rooms",
            table: "rooms",
            columns: [
                "id",
                "hotel_id",
                "room_type_id",
                "room_number",
                "status"
            ],
            values: row => [
                row.id,
                row.hotel_id,
                row.room_type_id,
                row.room_number,
                normalizeStatus(row.status)
            ]
        });

        // ======================================
        // 9. VOUCHERS
        // ======================================
        await importRows({
            label: "Vouchers",
            sheet: "14_vouchers",
            table: "vouchers",
            columns: [
                "id",
                "code",
                "discount_type",
                "discount_value",
                "min_order",
                "start_date",
                "end_date",
                "status"
            ],
            values: row => [
                row.id,
                row.code,
                normalizeStatus(row.discount_type),
                row.discount_value,
                row.min_order,
                excelDateToDate(row.start_date),
                excelDateToDate(row.end_date),
                normalizeStatus(row.status)
            ]
        });

        // ======================================
        // 10. ROOM TYPE IMAGES
        // ======================================
        await importRows({
            label: "Room Type Images",
            sheet: "17_room_type_images",
            table: "room_type_images",
            columns: [
                "id",
                "room_type_id",
                "image_url",
                "ordering"
            ],
            values: row => [
                row.id,
                row.room_type_id,
                row.image_url,
                row.ordering
            ]
        });

        // ======================================
        // HOÀN TẤT
        // ======================================
        await client.query("COMMIT");
        transactionStarted = false;

        console.log("\n========================================");
        console.log("       IMPORT THÀNH CÔNG");
        console.log("========================================");
        console.log("Dữ liệu mới đã được bổ sung.");
        console.log("Các bản ghi bị trùng khóa đã được bỏ qua.");
        console.log("Dữ liệu cũ không bị ghi đè hoặc xóa.");

    } catch (error) {
        if (client && transactionStarted) {
            try {
                await client.query("ROLLBACK");
                console.log("\nĐã rollback các thay đổi trong transaction.");
            } catch (rollbackError) {
                console.error("Lỗi rollback:", rollbackError.message);
            }
        }

        console.error("\n========================================");
        console.error("       IMPORT THẤT BẠI");
        console.error("========================================");
        console.error(error.message);

        process.exitCode = 1;

    } finally {
        if (client) {
            client.release();
        }

        await pool.end();
    }
}

importData();