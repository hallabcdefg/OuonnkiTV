import type { VideoItem } from '../types'

/**
 * 线路（采集站 / maccms）列表排序
 * ------------------------------------------------------------------
 * 需求：用「线路」做海报墙时，把片子排成：
 *   1) 国产内容优先（大陆 / 中国 / 港台等华语地区）
 *   2) 国产里「电视剧」排前面、「电影」排后面
 *   3) 当年（当前年份）的排在同类型前面
 *
 * 已知限制：采集站数据里没有「热度 / 播放量」字段（那是 TMDB 才有的），
 * 因此「热度」只能用「当年优先 + 源站默认顺序」近似；源站默认顺序一般是
 * 「最近更新」，与「新 / 热」接近。如需严格热度排序，只能切回 TMDB 海报墙。
 */

// 电视剧类关键词（含各国剧种，但刻意不含「剧情」以免误判类型）
const TV_KEYWORDS = [
  '电视剧', '连续剧', '剧集', '美剧', '韩剧', '日剧', '台剧', '网剧',
  '国产剧', '港剧', '泰剧', '英剧', '俄剧',
]
// 电影类关键词
const MOVIE_KEYWORDS = ['电影']

export type VideoKind = 'tv' | 'movie' | 'other'

/** 根据 type_name 粗略判定片子类型 */
export function classifyVideoKind(item: VideoItem): VideoKind {
  const t = (item.type_name || '').toLowerCase()
  if (TV_KEYWORDS.some(k => t.includes(k))) return 'tv'
  // 兜底：含「剧」但排除「剧情」（剧情是题材不是剧集类型）
  if (t.includes('剧') && !t.includes('剧情')) return 'tv'
  if (MOVIE_KEYWORDS.some(k => t.includes(k))) return 'movie'
  return 'other'
}

// 华语 / 国产地区关键词（含港台，常见「国产剧」也含港台）
const DOMESTIC_AREAS = [
  '大陆', '中国', '国产', '内地', '华语',
  '香港', '台湾', '港', '台',
]

/** 根据 vod_area 判定是否华语 / 国产内容（地区为空时视为未知 → 非国产） */
export function isDomesticArea(area?: string): boolean {
  if (!area) return false
  const a = area.toLowerCase()
  return DOMESTIC_AREAS.some(k => a.includes(k))
}

export interface SortCmsOptions {
  /** 当前年份，默认取系统当前年（跨年自动变） */
  currentYear?: number
  /** 是否把「国产」作为最外层分组优先（默认 true） */
  prioritizeDomestic?: boolean
}

/**
 * 排序打分：[国产分组, 类型, 年份]
 *  - 国产在前（prioritizeDomestic 时）
 *  - 同组内：电视剧(0) → 电影(1) → 其他(2)
 *  - 同类型内：当年(0) → 其他年份(1)
 * 稳定排序：最终以原始下标兜底，保留源站默认顺序（近似「热度」）
 */
function score(
  item: VideoItem,
  index: number,
  currentYear: number,
  prioritizeDomestic: boolean,
): number[] {
  const kind = classifyVideoKind(item)
  const kindRank = kind === 'tv' ? 0 : kind === 'movie' ? 1 : 2
  const domestic = isDomesticArea(item.vod_area)
  const domesticRank = prioritizeDomestic ? (domestic ? 0 : 1) : 0
  const yearRank = String(item.vod_year) === String(currentYear) ? 0 : 1
  // 末尾放原始下标，保证稳定排序
  return [domesticRank, kindRank, yearRank, index]
}

/**
 * 对线路列表排序。返回新数组，不修改入参。
 */
export function sortCmsItems(
  items: VideoItem[],
  options: SortCmsOptions = {},
): VideoItem[] {
  if (!Array.isArray(items) || items.length === 0) return items
  const currentYear = options.currentYear ?? new Date().getFullYear()
  const prioritizeDomestic = options.prioritizeDomestic ?? true

  return items
    .map((item, index) => ({ item, index }))
    .sort((a, b) => {
      const sa = score(a.item, a.index, currentYear, prioritizeDomestic)
      const sb = score(b.item, b.index, currentYear, prioritizeDomestic)
      for (let i = 0; i < sa.length; i++) {
        if (sa[i] !== sb[i]) return sa[i] - sb[i]
      }
      return 0
    })
    .map(x => x.item)
}
