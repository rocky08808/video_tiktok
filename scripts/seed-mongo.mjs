import { readFileSync } from "node:fs"
import { MongoClient } from "mongodb"

const uri = process.env.MONGODB_URI?.trim()
if (!uri) {
  console.error("缺少 MONGODB_URI。把它写进 .env.local 后再执行 npm run db:seed")
  process.exit(1)
}

const catalog = JSON.parse(readFileSync(new URL("../src/data/catalog.json", import.meta.url), "utf8"))
const videos = Array.isArray(catalog.videos) ? catalog.videos : []
const client = new MongoClient(uri, { serverSelectionTimeoutMS: 8000 })

await client.connect()
const database = process.env.MONGODB_DB?.trim() ? client.db(process.env.MONGODB_DB.trim()) : client.db()
const collection = database.collection(process.env.MONGODB_COLLECTION?.trim() || "videos")
const now = new Date()

for (const video of videos) {
  if (!video?.id || !video.src) continue
  const id = String(video.id)
  await collection.updateOne(
    { id },
    { $set: { ...video, id, updatedAt: now }, $setOnInsert: { createdAt: now } },
    { upsert: true },
  )
}

const count = await collection.countDocuments()
console.log(`已写入 ${database.databaseName}.${collection.collectionName}，当前共 ${count} 条`)
await client.close()
