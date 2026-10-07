const XLSX = require("xlsx");
const path = require("path");
const pool = require("./src/config/db");

const filePath = path.join(__dirname, "HOTEL_BOOKING.xlsx");

function excelDateToDate(value) {
    if (value === null || value === undefined || value === "") {
        return null;
    }

    // Excel serial date
    if (typeof value === "number") {
        const excelEpoch = new Date(Date.UTC(1899, 11, 30));
        const date = new Date(
            excelEpoch.getTime() + value * 24 * 60 * 60 * 1000
        );

        return date.toISOString().split("T")[0];
    }

    // Nếu đã là Date
    if (value instanceof Date) {
        return value.toISOString().split("T")[0];
    }

    // MM/DD/YYYY hoặc các chuỗi ngày khác
    const parsed = new Date(value);

    if (!isNaN(parsed.getTime())) {
        return parsed.toISOString().split("T")[0];
    }

    return value;
}

function normalizeStatus(value) {
    if (!value) return "active";

    return String(value).trim().toLowerCase();
}

function getRows(workbook, sheetName) {
    const worksheet = workbook.Sheets[sheetName];

    if (!worksheet) {
        throw new Error(`Không tìm thấy sheet: ${sheetName}`);
    }

    return XLSX.utils.sheet_to_json(worksheet, {
        defval: null
    });
}

async function importData() {
    let client;

    try {
        console.log("========================================");
        console.log("       HOTEL BOOKING DATA IMPORT");
        console.log("========================================");

        // Đọc Excel
        console.log("\nĐang đọc file Excel...");

        const workbook = XLSX.readFile(filePath);

        console.log(
            `Đã tìm thấy ${workbook.SheetNames.length} sheet.`
        );

        client = await pool.connect();

        console.log("\nĐang kết nối PostgreSQL...");

        await client.query("BEGIN");

        console.log("Transaction START");

        // =====================================================
        // 1. HOTELS
        // =====================================================

        console.log("\n[1/17] Import hotels...");

        const hotels = getRows(workbook, "02_hotels");

        for (const row of hotels) {
            await client.query(
                `
                INSERT INTO hotels
                (
                    id,
                    name,
                    description,
                    address,
                    city,
                    star_rating,
                    created_at
                )
                VALUES ($1,$2,$3,$4,$5,$6,$7)
                ON CONFLICT (id) DO NOTHING
                `,
                [
                    row.id,
                    row.name,
                    row.description,
                    row.address,
                    row.city,
                    row.star_rating,
                    excelDateToDate(row.created_at)
                ]
            );
        }

        console.log(`   ✓ ${hotels.length} hotels`);

        // =====================================================
        // 2. HOTEL IMAGES
        // =====================================================

        console.log("\n[2/17] Import hotel_images...");

        const hotelImages = getRows(
            workbook,
            "03_hotel_images"
        );

        for (const row of hotelImages) {
            await client.query(
                `
                INSERT INTO hotel_images
                (
                    id,
                    hotel_id,
                    image_url,
                    ordering
                )
                VALUES ($1,$2,$3,$4)
                ON CONFLICT (id) DO NOTHING
                `,
                [
                    row.id,
                    row.hotel_id,
                    row.image_url,
                    row.ordering
                ]
            );
        }

        console.log(`   ✓ ${hotelImages.length} hotel images`);

        // =====================================================
        // 3. AMENITIES
        // =====================================================

        console.log("\n[3/17] Import amenities...");

        const amenities = getRows(
            workbook,
            "04_amenities"
        );

        for (const row of amenities) {
            await client.query(
                `
                INSERT INTO amenities
                (
                    id,
                    name,
                    description
                )
                VALUES ($1,$2,$3)
                ON CONFLICT (id) DO NOTHING
                `,
                [
                    row.id,
                    row.name,
                    row.description
                ]
            );
        }

        console.log(`   ✓ ${amenities.length} amenities`);

        // =====================================================
        // 4. HOTEL AMENITIES
        // =====================================================

        console.log("\n[4/17] Import hotel_amenities...");

        const hotelAmenities = getRows(
            workbook,
            "05_hotel_amenities"
        );

        for (const row of hotelAmenities) {
            await client.query(
                `
                INSERT INTO hotel_amenities
                (
                    hotel_id,
                    amenity_id
                )
                VALUES ($1,$2)
                ON CONFLICT DO NOTHING
                `,
                [
                    row.hotel_id,
                    row.amenity_id
                ]
            );
        }

        console.log(
            `   ✓ ${hotelAmenities.length} hotel amenities`
        );

        // =====================================================
        // 5. VIBE TAGS
        // =====================================================

        console.log("\n[5/17] Import vibe_tags...");

        const vibes = getRows(
            workbook,
            "06_vibe_tags"
        );

        for (const row of vibes) {
            await client.query(
                `
                INSERT INTO vibe_tags
                (
                    id,
                    name,
                    description
                )
                VALUES ($1,$2,$3)
                ON CONFLICT (id) DO NOTHING
                `,
                [
                    row.id,
                    row.name,
                    row.description
                ]
            );
        }

        console.log(`   ✓ ${vibes.length} vibe tags`);

        // =====================================================
        // 6. HOTEL VIBES
        // =====================================================

        console.log("\n[6/17] Import hotel_vibes...");

        const hotelVibes = getRows(
            workbook,
            "07_hotel_vibes"
        );

        for (const row of hotelVibes) {
            await client.query(
                `
                INSERT INTO hotel_vibes
                (
                    hotel_id,
                    vibe_id
                )
                VALUES ($1,$2)
                ON CONFLICT DO NOTHING
                `,
                [
                    row.hotel_id,
                    row.vibe_id
                ]
            );
        }

        console.log(`   ✓ ${hotelVibes.length} hotel vibes`);

        // =====================================================
        // 7. ROOM TYPES
        // =====================================================

        console.log("\n[7/17] Import room_types...");

        const roomTypes = getRows(
            workbook,
            "08_room_types"
        );

        for (const row of roomTypes) {
            await client.query(
                `
                INSERT INTO room_types
                (
                    id,
                    hotel_id,
                    name,
                    description,
                    max_guests,
                    base_price
                )
                VALUES ($1,$2,$3,$4,$5,$6)
                ON CONFLICT (id) DO NOTHING
                `,
                [
                    row.id,
                    row.hotel_id,
                    row.name,
                    row.description,
                    row.max_guests,
                    row.base_price
                ]
            );
        }

        console.log(`   ✓ ${roomTypes.length} room types`);

        // =====================================================
        // 8. ROOMS
        // =====================================================

        console.log("\n[8/17] Import rooms...");

        const rooms = getRows(
            workbook,
            "09_rooms"
        );

        for (const row of rooms) {
            await client.query(
                `
                INSERT INTO rooms
                (
                    id,
                    hotel_id,
                    room_type_id,
                    room_number,
                    status
                )
                VALUES ($1,$2,$3,$4,$5)
                ON CONFLICT (id) DO NOTHING
                `,
                [
                    row.id,
                    row.hotel_id,
                    row.room_type_id,
                    row.room_number,
                    normalizeStatus(row.status)
                ]
            );
        }

        console.log(`   ✓ ${rooms.length} rooms`);

        // =====================================================
        // 9. VOUCHERS
        // =====================================================

        console.log("\n[9/17] Import vouchers...");

        const vouchers = getRows(
            workbook,
            "14_vouchers"
        );

        for (const row of vouchers) {
            await client.query(
                `
                INSERT INTO vouchers
                (
                    id,
                    code,
                    discount_type,
                    discount_value,
                    min_order,
                    start_date,
                    end_date,
                    status
                )
                VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
                ON CONFLICT (id) DO NOTHING
                `,
                [
                    row.id,
                    row.code,
                    normalizeStatus(row.discount_type),
                    row.discount_value,
                    row.min_order,
                    excelDateToDate(row.start_date),
                    excelDateToDate(row.end_date),
                    normalizeStatus(row.status)
                ]
            );
        }

        console.log(`   ✓ ${vouchers.length} vouchers`);

        // =====================================================
        // 10. ROOM TYPE IMAGES
        // =====================================================

        console.log("\n[10/17] Import room_type_images...");

        const roomTypeImages = getRows(
            workbook,
            "17_room_type_images"
        );

        for (const row of roomTypeImages) {
            await client.query(
                `
                INSERT INTO room_type_images
                (
                    id,
                    room_type_id,
                    image_url,
                    ordering
                )
                VALUES ($1,$2,$3,$4)
                ON CONFLICT (id) DO NOTHING
                `,
                [
                    row.id,
                    row.room_type_id,
                    row.image_url,
                    row.ordering
                ]
            );
        }

        console.log(
            `   ✓ ${roomTypeImages.length} room type images`
        );

        // =====================================================
        // EMPTY TABLES
        // =====================================================

        console.log("\n[11/17] bookings...");
        console.log("   - Sheet đang trống → bỏ qua");

        console.log("\n[12/17] booking_rooms...");
        console.log("   - Sheet đang trống → bỏ qua");

        console.log("\n[13/17] guests...");
        console.log("   - Sheet đang trống → bỏ qua");

        console.log("\n[14/17] payments...");
        console.log("   - Sheet đang trống → bỏ qua");

        console.log("\n[15/17] favorites...");
        console.log("   - Sheet đang trống → bỏ qua");

        console.log("\n[16/17] reviews...");
        console.log("   - Sheet đang trống → bỏ qua");

        console.log("\n[17/17] users...");
        console.log("   - Sheet đang trống → bỏ qua");

        // =====================================================
        // COMMIT
        // =====================================================

        await client.query("COMMIT");

        console.log("\n========================================");
        console.log("       IMPORT THÀNH CÔNG");
        console.log("========================================");

    } catch (error) {

        console.error("\n========================================");
        console.error("       IMPORT THẤT BẠI");
        console.error("========================================");

        console.error("\nLỗi:");
        console.error(error.message);

        if (client) {
            await client.query("ROLLBACK");

            console.log(
                "\nĐã ROLLBACK toàn bộ dữ liệu."
            );
        }

    } finally {

        if (client) {
            client.release();
        }

        await pool.end();
    }
}

importData();