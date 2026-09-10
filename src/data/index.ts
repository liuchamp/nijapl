import { buildData, DataRepository } from './repository.js'

/** 全局单例仓库：页面 / 引擎的唯一数据入口。 */
export const repository: DataRepository = new DataRepository(buildData)

export { buildData, DataRepository } from './repository.js'
