import { MongoClient, type Collection, type Document } from "mongodb"

const globalForMongo = globalThis as typeof globalThis & {
  mongoClient?: Promise<MongoClient>
}

export function mongoUri() {
  return process.env.MONGODB_URI?.trim() || ""
}

export async function getMongoClient() {
  const uri = mongoUri()
  if (!uri) throw new Error("缺少 MONGODB_URI")
  if (!globalForMongo.mongoClient) {
    const client = new MongoClient(uri, { serverSelectionTimeoutMS: 8000 })
    globalForMongo.mongoClient = client.connect().catch((error: unknown) => {
      globalForMongo.mongoClient = undefined
      throw error
    })
  }
  return globalForMongo.mongoClient
}

export async function getDb() {
  const client = await getMongoClient()
  return process.env.MONGODB_DB?.trim() ? client.db(process.env.MONGODB_DB.trim()) : client.db()
}

export async function getVideoCollection(): Promise<Collection<Document>> {
  const database = await getDb()
  return database.collection(process.env.MONGODB_COLLECTION?.trim() || "videos")
}

export async function getUsersCollection(): Promise<Collection<Document>> {
  const database = await getDb()
  return database.collection("users")
}

export async function getSessionsCollection(): Promise<Collection<Document>> {
  const database = await getDb()
  return database.collection("sessions")
}

export async function getVipOrdersCollection(): Promise<Collection<Document>> {
  const database = await getDb()
  return database.collection("vip_orders")
}

export async function getPicsCollection(): Promise<Collection<Document>> {
  const database = await getDb()
  return database.collection(process.env.MONGODB_PICS_COLLECTION?.trim() || "pics")
}

export async function getMoviesCollection(): Promise<Collection<Document>> {
  const database = await getDb()
  return database.collection(process.env.MONGODB_MOVIES_COLLECTION?.trim() || "movies")
}

export async function getSettingsCollection(): Promise<Collection<Document>> {
  const database = await getDb()
  return database.collection("settings")
}

export async function getRateLimitsCollection(): Promise<Collection<Document>> {
  const database = await getDb()
  return database.collection("rate_limits")
}

export async function getUserReactionsCollection(): Promise<Collection<Document>> {
  const database = await getDb()
  return database.collection("user_reactions")
}

export function describeMongoError(error: unknown) {
  const message = error instanceof Error ? error.message : ""
  if (/Authentication failed|auth failed|bad auth/i.test(message)) {
    return "MongoDB 账号或密码不对。宝塔创建的用户，认证库一般就是数据库名，连接串要带 ?authSource=数据库名"
  }
  if (/ECONNREFUSED|ENOTFOUND|timed out|Server selection|ETIMEDOUT|ECONNRESET/i.test(message)) {
    return "连不上宝塔上的 MongoDB。本机调试要用服务器公网 IP，并放行 27017；Mongo 的 bindIp 不能只写 127.0.0.1。网站如果部署在这台宝塔上，地址改用 127.0.0.1"
  }
  return "连不上宝塔 MongoDB"
}
