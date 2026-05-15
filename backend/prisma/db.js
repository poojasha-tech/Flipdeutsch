import { PrismaClient } from "@prisma/client";
var prisma = new PrismaClient({
    log: ['query', 'info', 'warn', 'error']
})
export default prisma;