import { readFileSync } from "node:fs"
import { MongoClient } from "mongodb"

const uri = process.env.MONGODB_URI?.trim()
if (!uri) {
  console.error("缺少 MONGODB_URI。把它写进 .env.local 后再执行。")
  process.exit(1)
}

const parsed = JSON.parse(readFileSync(new URL("../src/data/pics.json", import.meta.url), "utf8"))
const list = Array.isArray(parsed.pics) ? parsed.pics : []
const client = new MongoClient(uri, { serverSelectionTimeoutMS: 15000 })

await client.connect()
const database = process.env.MONGODB_DB?.trim() ? client.db(process.env.MONGODB_DB.trim()) : client.db()
const collection = database.collection("pics")
const now = new Date()
const seen = new Set()
const ops = []
let skipped = 0

list.forEach((pic, index) => {
  const id = String(pic?.name ?? "").trim()
  const src = String(pic?.pic ?? "").trim()
  if (!id || !src || seen.has(id)) {
    skipped += 1
    return
  }
  seen.add(id)
  ops.push({
    updateOne: {
      filter: { id },
      update: {
        $set: {
          id,
          name: id,
          pic: src,
          src,
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
const batchSize = 500
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
  .find({}, { projection: { _id: 0, id: 1, pic: 1, order: 1 } })
  .sort({ order: 1 })
  .limit(1)
  .toArray()
console.log(JSON.stringify({ written: ops.length, upserted, modified, skipped, total, sample: sample[0] ?? null }))
await client.close()
