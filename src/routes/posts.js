const express = require("express");
const pool = require("../config/db");
const { requireAuth, optionalAuth } = require("../middleware/auth");

const router = express.Router();
const POST_FIELDS = ["title", "location", "rating", "content"];
const POST_SELECT = `
  SELECT p.id, p.user_id, p.title, p.location, p.rating, p.content,
         p.status, p.created_at, p.updated_at,
         u.full_name AS author_name, u.avatar AS author_avatar,
         COALESCE((
           SELECT json_agg(json_build_object(
             'id', pi.id, 'storage_key', pi.storage_key, 'mime_type', pi.mime_type,
             'size_bytes', pi.size_bytes, 'sort_order', pi.sort_order
           ) ORDER BY pi.sort_order, pi.id)
           FROM post_images pi WHERE pi.post_id = p.id
         ), '[]'::json) AS images
  FROM posts p JOIN users u ON u.id = p.user_id`;

function pagination(query) {
  const page = query.page === undefined ? 1 : Number(query.page);
  const limit = query.limit === undefined ? 20 : Number(query.limit);
  if (!Number.isInteger(page) || page < 1 || !Number.isInteger(limit) || limit < 1 || limit > 50) return null;
  return { page, limit, offset: (page - 1) * limit };
}

function pageResponse(page, limit, total) {
  return { page, limit, total, pages: Math.ceil(total / limit) };
}

function validatePost(body, partial = false) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return "Request body must be a JSON object";
  const keys = Object.keys(body);
  if (keys.some((key) => !POST_FIELDS.includes(key))) return "Only title, location, rating, and content are accepted";
  if (partial && keys.length === 0) return "At least one post field is required";
  for (const key of ["title", "location", "content"]) {
    if (body[key] === undefined) {
      if (!partial) return `${key} is required`;
      continue;
    }
    const max = key === "content" ? 10000 : 200;
    if (typeof body[key] !== "string" || !body[key].trim() || body[key].trim().length > max) {
      return `${key} must be a non-empty string of at most ${max} characters`;
    }
  }
  if (body.rating === undefined && !partial) return "rating is required";
  if (body.rating !== undefined && (!Number.isInteger(body.rating) || body.rating < 1 || body.rating > 5)) {
    return "rating must be an integer from 1 to 5";
  }
  return null;
}

function logDatabaseError(label, error) {
  console.error(`${label}:`, error.code || "DB_ERROR");
}

// Search published posts. Escape LIKE wildcards so q is treated as literal text.
router.get("/search", optionalAuth, async (req, res) => {
  const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
  const paging = pagination(req.query);
  if (!q || q.length > 100) return res.status(400).json({ success: false, message: "q is required and must be at most 100 characters" });
  if (!paging) return res.status(400).json({ success: false, message: "page must be positive and limit must be from 1 to 50" });
  const escaped = q.replace(/[\\%_]/g, "\\$&");
  const pattern = `%${escaped}%`;
  try {
    const count = await pool.query(
      `SELECT COUNT(*)::int AS total FROM posts p JOIN users u ON u.id=p.user_id
       WHERE p.status='published' AND u.account_status='active' AND (u.is_private=FALSE OR u.id=$2)
         AND (p.title ILIKE $1 ESCAPE '\\' OR p.location ILIKE $1 ESCAPE '\\' OR p.content ILIKE $1 ESCAPE '\\')`, [pattern, req.user?.id || null]
    );
    const result = await pool.query(
      `${POST_SELECT} WHERE p.status='published' AND u.account_status='active' AND (u.is_private=FALSE OR u.id=$4)
       AND (p.title ILIKE $1 ESCAPE '\\' OR p.location ILIKE $1 ESCAPE '\\' OR p.content ILIKE $1 ESCAPE '\\')
       ORDER BY p.created_at DESC, p.id DESC LIMIT $2 OFFSET $3`, [pattern, paging.limit, paging.offset, req.user?.id || null]
    );
    return res.json({ success: true, data: result.rows, pagination: pageResponse(paging.page, paging.limit, count.rows[0].total) });
  } catch (error) {
    logDatabaseError("Post search failed", error);
    return res.status(500).json({ success: false, message: "Unable to search posts" });
  }
});

router.get("/mine", requireAuth, async (req, res) => {
  const paging = pagination(req.query);
  if (!paging) return res.status(400).json({ success: false, message: "page must be positive and limit must be from 1 to 50" });
  try {
    const count = await pool.query("SELECT COUNT(*)::int AS total FROM posts WHERE user_id=$1", [req.user.id]);
    const result = await pool.query(`${POST_SELECT} WHERE p.user_id=$1 ORDER BY p.created_at DESC,p.id DESC LIMIT $2 OFFSET $3`, [req.user.id, paging.limit, paging.offset]);
    return res.json({ success: true, data: result.rows, pagination: pageResponse(paging.page, paging.limit, count.rows[0].total) });
  } catch (error) {
    logDatabaseError("User post list failed", error);
    return res.status(500).json({ success: false, message: "Unable to get your posts" });
  }
});

router.get("/users/:userId", optionalAuth, async (req, res) => {
  const paging = pagination(req.query);
  if (!paging) return res.status(400).json({ success: false, message: "page must be positive and limit must be from 1 to 50" });
  try {
    const profile = await pool.query(
      "SELECT id,full_name,avatar,is_private FROM users WHERE id=$1 AND account_status='active'",
      [req.params.userId]
    );
    if (!profile.rows.length) return res.status(404).json({ success: false, message: "User not found" });

    const count = await pool.query(
      `SELECT COUNT(*)::int AS total FROM posts p JOIN users u ON u.id=p.user_id
       WHERE p.user_id=$1 AND p.status='published' AND u.account_status='active' AND (u.is_private=FALSE OR u.id=$2)`, [req.params.userId, req.user?.id || null]
    );
    const result = await pool.query(
      `${POST_SELECT} WHERE p.user_id=$1 AND p.status='published' AND u.account_status='active' AND (u.is_private=FALSE OR u.id=$4)
       ORDER BY p.created_at DESC,p.id DESC LIMIT $2 OFFSET $3`, [req.params.userId, paging.limit, paging.offset, req.user?.id || null]
    );
    return res.json({ success: true, profile: profile.rows[0], data: result.rows, pagination: pageResponse(paging.page, paging.limit, count.rows[0].total) });
  } catch (error) {
    if (error.code === "22P02") return res.status(400).json({ success: false, message: "userId must be a UUID" });
    logDatabaseError("User post list failed", error);
    return res.status(500).json({ success: false, message: "Unable to get user posts" });
  }
});

router.get("/:id/comments", optionalAuth, async (req, res) => {
  const paging = pagination(req.query);
  if (!paging) return res.status(400).json({ success: false, message: "page must be positive and limit must be from 1 to 50" });
  try {
    const post = await pool.query("SELECT p.id FROM posts p JOIN users u ON u.id=p.user_id WHERE p.id=$1 AND p.status='published' AND u.account_status='active' AND (u.is_private=FALSE OR u.id=$2)", [req.params.id, req.user?.id || null]);
    if (!post.rows.length) return res.status(404).json({ success: false, message: "Post not found" });
    const count = await pool.query("SELECT COUNT(*)::int AS total FROM post_comments WHERE post_id=$1", [req.params.id]);
    const result = await pool.query(
      `SELECT c.id,c.post_id,c.user_id,c.content,c.created_at,u.full_name AS author_name,u.avatar AS author_avatar
       FROM post_comments c JOIN users u ON u.id=c.user_id
       WHERE c.post_id=$1 AND u.account_status='active'
       ORDER BY c.created_at DESC,c.id DESC LIMIT $2 OFFSET $3`, [req.params.id, paging.limit, paging.offset]
    );
    return res.json({ success: true, data: result.rows, pagination: pageResponse(paging.page, paging.limit, count.rows[0].total) });
  } catch (error) {
    if (error.code === "22P02") return res.status(400).json({ success: false, message: "post id must be a UUID" });
    logDatabaseError("Post comment list failed", error);
    return res.status(500).json({ success: false, message: "Unable to get comments" });
  }
});

router.post("/:id/comments", requireAuth, async (req, res) => {
  const content = req.body && req.body.content;
  if (typeof content !== "string" || !content.trim() || content.trim().length > 2000) {
    return res.status(400).json({ success: false, message: "content must be a non-empty string of at most 2000 characters" });
  }
  try {
    const post = await pool.query("SELECT p.id FROM posts p JOIN users u ON u.id=p.user_id WHERE p.id=$1 AND p.status='published' AND u.account_status='active' AND (u.is_private=FALSE OR u.id=$2)", [req.params.id, req.user.id]);
    if (!post.rows.length) return res.status(404).json({ success: false, message: "Post not found" });
    const result = await pool.query(
      `INSERT INTO post_comments(post_id,user_id,content) VALUES($1,$2,$3)
       RETURNING id,post_id,user_id,content,created_at`, [req.params.id, req.user.id, content.trim()]
    );
    return res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) {
    if (error.code === "22P02") return res.status(400).json({ success: false, message: "post id must be a UUID" });
    if (error.code === "23503") return res.status(404).json({ success: false, message: "Post or user not found" });
    logDatabaseError("Post comment creation failed", error);
    return res.status(500).json({ success: false, message: "Unable to create comment" });
  }
});

router.delete("/:id/comments/:commentId", requireAuth, async (req, res) => {
  try {
    const result = await pool.query("DELETE FROM post_comments WHERE id=$1 AND post_id=$2 AND user_id=$3 RETURNING id", [req.params.commentId, req.params.id, req.user.id]);
    if (!result.rowCount) return res.status(404).json({ success: false, message: "Comment not found" });
    return res.json({ success: true, message: "Comment deleted" });
  } catch (error) {
    if (error.code === "22P02") return res.status(400).json({ success: false, message: "post and comment ids must be UUIDs" });
    logDatabaseError("Post comment deletion failed", error);
    return res.status(500).json({ success: false, message: "Unable to delete comment" });
  }
});

router.get("/:id", optionalAuth, async (req, res) => {
  try {
    const result = await pool.query(`${POST_SELECT} WHERE p.id=$1 AND p.status='published' AND u.account_status='active' AND (u.is_private=FALSE OR u.id=$2)`, [req.params.id, req.user?.id || null]);
    if (!result.rows.length) return res.status(404).json({ success: false, message: "Post not found" });
    return res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    if (error.code === "22P02") return res.status(400).json({ success: false, message: "post id must be a UUID" });
    logDatabaseError("Post retrieval failed", error);
    return res.status(500).json({ success: false, message: "Unable to get post" });
  }
});

router.get("/", optionalAuth, async (req, res) => {
  const paging = pagination(req.query);
  if (!paging) return res.status(400).json({ success: false, message: "page must be positive and limit must be from 1 to 50" });
  try {
    const count = await pool.query("SELECT COUNT(*)::int AS total FROM posts p JOIN users u ON u.id=p.user_id WHERE p.status='published' AND u.account_status='active' AND (u.is_private=FALSE OR u.id=$1)", [req.user?.id || null]);
    const result = await pool.query(`${POST_SELECT} WHERE p.status='published' AND u.account_status='active' AND (u.is_private=FALSE OR u.id=$1) ORDER BY p.created_at DESC,p.id DESC LIMIT $2 OFFSET $3`, [req.user?.id || null, paging.limit, paging.offset]);
    return res.json({ success: true, data: result.rows, pagination: pageResponse(paging.page, paging.limit, count.rows[0].total) });
  } catch (error) {
    logDatabaseError("Post feed failed", error);
    return res.status(500).json({ success: false, message: "Unable to get posts" });
  }
});

router.post("/", requireAuth, async (req, res) => {
  const validation = validatePost(req.body);
  if (validation) return res.status(400).json({ success: false, message: validation });
  try {
    const result = await pool.query(
      `INSERT INTO posts(user_id,title,location,rating,content)
       VALUES($1,$2,$3,$4,$5) RETURNING id,user_id,title,location,rating,content,status,created_at,updated_at`,
      [req.user.id, req.body.title.trim(), req.body.location.trim(), req.body.rating, req.body.content.trim()]
    );
    return res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) {
    if (error.code === "23503") return res.status(404).json({ success: false, message: "User not found" });
    logDatabaseError("Post creation failed", error);
    return res.status(500).json({ success: false, message: "Unable to create post" });
  }
});

router.put("/:id", requireAuth, async (req, res) => {
  const validation = validatePost(req.body, true);
  if (validation) return res.status(400).json({ success: false, message: validation });
  const values = POST_FIELDS.map((field) => field === "rating" ? req.body[field] ?? null : req.body[field] === undefined ? null : req.body[field].trim());
  try {
    const result = await pool.query(
      `UPDATE posts SET title=COALESCE($1,title),location=COALESCE($2,location),rating=COALESCE($3,rating),
       content=COALESCE($4,content),updated_at=NOW()
       WHERE id=$5 AND user_id=$6 AND status='published'
       RETURNING id,user_id,title,location,rating,content,status,created_at,updated_at`, [...values, req.params.id, req.user.id]
    );
    if (!result.rows.length) return res.status(404).json({ success: false, message: "Post not found" });
    return res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    if (error.code === "22P02") return res.status(400).json({ success: false, message: "post id must be a UUID" });
    logDatabaseError("Post update failed", error);
    return res.status(500).json({ success: false, message: "Unable to update post" });
  }
});

router.delete("/:id", requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      `UPDATE posts SET status='deleted',updated_at=NOW()
       WHERE id=$1 AND user_id=$2 AND status='published' RETURNING id,status,updated_at`, [req.params.id, req.user.id]
    );
    if (!result.rows.length) return res.status(404).json({ success: false, message: "Post not found" });
    return res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    if (error.code === "22P02") return res.status(400).json({ success: false, message: "post id must be a UUID" });
    logDatabaseError("Post deletion failed", error);
    return res.status(500).json({ success: false, message: "Unable to delete post" });
  }
});

module.exports = router;
