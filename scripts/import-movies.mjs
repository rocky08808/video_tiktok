import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"
import { MongoClient } from "mongodb"

const uri = process.env.MONGODB_URI?.trim()
if (!uri) {
  console.error("缺少 MONGODB_URI。把它写进 .env.local 后再执行。")
  process.exit(1)
}

const parsed = JSON.parse(readFileSync(new URL("../src/data/movies.json", import.meta.url), "utf8"))
const list = Array.isArray(parsed.list) ? parsed.list : Array.isArray(parsed.movies) ? parsed.movies : []
const client = new MongoClient(uri, { serverSelectionTimeoutMS: 15000 })

function movieId(item, index) {
  const video = String(item?.video ?? "").trim()
  if (video) {
    try {
      const parts = new URL(video).pathname.split("/").filter(Boolean)
      // .../20230325/u86YdGFC/index.m3u8 → u86YdGFC
      if (parts.length >= 2) {
        const folder = parts[parts.length - 2]
        if (folder && !/\.m3u8$/i.test(folder)) return folder
      }
    } catch {
      // fall through
    }
    return createHash("sha1").update(video).digest("hex").slice(0, 16)
  }
  const title = String(item?.title ?? "").trim()
  return createHash("sha1").update(`${title}|${index}`).digest("hex").slice(0, 16)
}

await client.connect()
const database = process.env.MONGODB_DB?.trim() ? client.db(process.env.MONGODB_DB.trim()) : client.db()
const collection = database.collection(process.env.MONGODB_MOVIES_COLLECTION?.trim() || "movies")
const now = new Date()
const seen = new Set()
const ops = []
let skipped = 0

list.forEach((item, index) => {
  const title = String(item?.title ?? "").trim()
  const video = String(item?.video ?? "").trim()
  const img = String(item?.img ?? "").trim()
  if (!title || seen.has(title + "|" + video)) {
    skipped += 1
    return
  }
  const id = movieId(item, index)
  if (!id || seen.has(id)) {
    skipped += 1
    return
  }
  seen.add(id)
  seen.add(title + "|" + video)
  ops.push({
    updateOne: {
      filter: { id },
      update: {
        $set: {
          id,
          name: title,
          title,
          img,
          poster: img,
          video,
          src: video,
          m3u8: video,
          order: index,
          updatedAt: now,
        },
        $setOnInsert: { createdAt: now },
      },
      upsert: true,
    },
  })
})

let upserted = 0
let modified = 0
const batchSize = 400
for (let offset = 0; offset < ops.length; offset += batchSize) {
  const result = await collection.bulkWrite(ops.slice(offset, offset + batchSize), { ordered: false })
  upserted += result.upsertedCount
  modified += result.modifiedCount
  console.log(`进度 ${Math.min(offset + batchSize, ops.length)}/${ops.length}`)
}

await collection.createIndex({ id: 1 }, { unique: true })
await collection.createIndex({ order: 1 })
const total = await collection.countDocuments()
const sample = await collection
  .find({}, { projection: { _id: 0, id: 1, title: 1, video: 1, img: 1, order: 1 } })
  .sort({ order: 1 })
  .limit(1)
  .toArray()
console.log(JSON.stringify({ written: ops.length, upserted, modified, skipped, total, sample: sample[0] ?? null }))
await client.close()
