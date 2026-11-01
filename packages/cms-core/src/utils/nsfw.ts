import type { VideoItem } from '../types'

/**
 * 成人 / 色情内容过滤
 * 用途：各视频源（采集站）返回的条目在进入搜索 / 浏览列表前，先用本模块剔除成人内容，
 * 避免色情站点或站点里混入的成人条目出现在首页 / 搜索结果中。
 *
 * 关键词集中在「片名(vod_name)」与「分类(type_name)」两处，且只收录高确定性色情词，
 * 避免误伤正常影视（如「伦理片」「写真」「裸」等模糊词故意不放进来，以免误删正常内容）。
 * 对整条都是色情站的线路，更彻底的做法是在源 JSON 里把该源 `isEnabled` 置为 false。
 */

// 高确定性色情关键词（中英文，小写匹配）
const NSFW_KEYWORDS = [
  '色情', '情色', '成人', '福利', '三级', '麻豆', '性爱', '春药',
  '强奸', '嫖', '床戏', '黄片', '苍井', '艳情', 'AV', 'av片', '限制级',
  'porn', 'xxx', 'adult', 'hentai',
]

// 成人分类名（采集站常用的成人 type_name）
const NSFW_TYPE_NAMES = [
  '色情', '情色', '成人', '福利', '三级', '麻豆', 'av', '限制级',
]

export function isAdultVideoItem(item: VideoItem): boolean {
  if (!item) return false
  const name = (item.vod_name || '').toLowerCase()
  const typeName = (item.type_name || '').toLowerCase()
  if (NSFW_TYPE_NAMES.some(k => typeName === k || typeName.includes(k))) {
    return true
  }
  const haystack = `${name} ${typeName}`
  return NSFW_KEYWORDS.some(k => haystack.includes(k.toLowerCase()))
}

export function filterAdultVideoItems(items: VideoItem[]): VideoItem[] {
  if (!Array.isArray(items)) return []
  return items.filter(i => !isAdultVideoItem(i))
}
