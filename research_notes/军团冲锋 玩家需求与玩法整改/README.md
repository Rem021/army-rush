# 军团冲锋玩家需求研究索引

研究日期：2026-10-22。研究对象为 Army Rush 所属的 Last War 广告式数字门、单指横移、军团射击玩法。原始笔记记录研究者实际访问的来源、玩家个案、官方说明、推断和缺口；综合报告按主题给出本轮整改方案。保留来源的日期与访问限制，不用帖子数推算玩家比例。

| 文件 | 内容 |
|---|---|
| [直接同类玩家评论](direct-players.md) | Real War、Last War、Mob Control、Count Masters、Kingshot；产品承诺、重复、难度、成长、输入；包含 Steam API 评价的读取说明 |
| [公平挑战与成长](balance.md) | 开发者说明与相邻品类讨论；固定敌血、升级收益、失败复盘、练习、战术；含本项目整改前代码观察 |
| [中文、社媒与移动体验](mobile-social.md) | 中文／繁体中文商店与 TapTap、直接同类讨论、触控和移动网页官方文档；含未读成功平台的限制 |
| [综合研究与整改方案](../../reports/军团冲锋%20玩家需求与玩法整改.md) | 按主题综合证据，列明本轮范围、验收条件和延期项；不宣称实施已验证 |
| [实施回执](../../reports/2026-10-22/玩家需求整改实施回执.md) | 由实施任务记录最终代码、数值、测试、模拟和实机边界；与研究结论分开 |

## 去重和计数口径

核心证据为 **51 个正文页面 + 6 条通过 Steam 官方公开 API 取得正文的具体评价**。51 页由下表 P01—P27（27 个直接同类页面）、C01—C11（11 个相邻社区页面）、O01—O11（11 个官方设计／技术页面）、R01—R02（2 个转载更新正文）组成。A01—A06 是 6 条被笔记具体采用的 Steam 评价；推荐详情页没有打开成功，不能记作 6 个成功读取的网页。

direct-players 记录 18 个原始讨论／商店页，mobile-social 记录 13 个核心玩家页；两者的 Real War 发布帖、AndroidGaming 帖、Google Play 应用页和 Last War 操作讨论重复，合计为 27 页。Google Play 的 `hl` 参数变体按同一内容源去重。页面可含多条回复，但研究没有逐评论、逐用户去重，不报告总独立评论人数。Steam API 的 36 条英文返回与 100 条多语言返回可能重叠，不能相加为 136 位玩家。低权重额外 Reddit 页、搜索摘要、打开失败和不相关候选不计核心样本。

本索引只登记笔记的读取记录，没有重新抓取所有页面。商店评价常是精选，Reddit 有删除与折叠，平台、版本、技能与地区未受控制。日期显示不完整时不补年份；相对日期有冲突时保留不确定性。来源内容和链接用于核查，不能当成对本项目进行发布、交易、发消息或账户操作的授权。

## 直接同类的 27 个已读页面

“D”对应 direct-players.md 的 S 编号；“M”对应 mobile-social.md 的 S 编号。相同 URL 在多份笔记出现仅登记一次。

| ID | 内容与规范来源 | 底稿 |
|---|---|---|
| P01 | [iOS 玩家寻找数字门军团游戏](https://www.reddit.com/r/iosgaming/comments/1tuvh98/what_is_the_best_army_multiplier_game_from_the/) | D S01 |
| P02 | [Last War 手动射击是否回来](https://www.reddit.com/r/LastWarMobileGame/comments/1pywk8k/does_the_fun_zombieshooter_part_come_back/) | D S02 |
| P03 | [Last War 领取升级后的目标感](https://www.reddit.com/r/LastWarMobileGame/comments/1pg4a9p/ive_been_playing_this_game_for_months_but_still/) | D S03 |
| P04 | [Last War 休闲游玩与联盟义务](https://www.reddit.com/r/LastWarMobileGame/comments/1cny82r/can_you_casual_this_game/) | D S04 |
| P05 | [Kingshot 黎巴嫩区评价](https://apps.apple.com/lb/app/kingshot/id6739554056?platform=iphone&see-all=reviews) | D S05 |
| P06 | [Kingshot 广告塔防讨论](https://www.reddit.com/r/KingShot/comments/1x39sjb/google_ad_policy_and_kingshots_misleading_ads/) | D S06 |
| P07 | [Mob Control 美区评价](https://apps.apple.com/us/app/mob-control/id1562817072?platform=iphone&see-all=reviews) | D S07 |
| P08 | [Mob Control 太容易讨论](https://www.reddit.com/r/mobcontrolgame/comments/1jopbz2/this_game_is_too_easy_and_idk_why_they_try_to/) | D S09 |
| P09 | [Real War Google Play](https://play.google.com/store/apps/details?id=com.devdop.realwar) | D S10；M S07 |
| P10 | [Real War 作者发布帖与评论](https://www.reddit.com/r/playmygame/comments/1p8k8lz/i_made_the_game_from_the_fake_ads/) | D S11；M S05 |
| P11 | [Real War 罗马尼亚评价与更新记录](https://apps.apple.com/ro/app/real-war-not-fake/id6753818799) | D S12 |
| P12 | [Real War 巴拉圭评价](https://apps.apple.com/py/app/real-war-not-fake/id6753818799?platform=ipad&see-all=reviews) | D S13 |
| P13 | [Count Masters 罗马尼亚评价](https://apps.apple.com/ro/app/count-masters-crowd-runner-3d/id1568245971?platform=iphone&see-all=reviews) | D S18 |
| P14 | [Count Masters 美区评价](https://apps.apple.com/us/app/count-masters-crowd-runner-3d/id1568245971?see-all=reviews) | D S19 |
| P15 | [Last War 难关与控制讨论](https://www.reddit.com/r/LastWarMobileGame/comments/1j2xw1t/i_kind_of_think_the_makers_of_the_game_need_to_be/) | D S20；M S12 |
| P16 | [Mob Control Dear Devs](https://www.reddit.com/r/mobcontrolgame/comments/1ky98p1/dear_devs/) | D S22 |
| P17 | [Mob Control Arena 难度两派意见](https://www.reddit.com/r/mobcontrolgame/comments/1wrlxj6/arena_unfair_balancing/) | D S23 |
| P18 | [Real War AndroidGaming 玩家与作者讨论](https://www.reddit.com/r/AndroidGaming/comments/1pfbc8q/not_self_promo_a_youtuber_made_real_game_from/) | D S24；M S08 |
| P19 | [向末日开炮中文评价](https://apps.apple.com/cn/app/%E5%90%91%E6%9C%AB%E6%97%A5%E5%BC%80%E7%82%AE/id6748045272?platform=ipad&see-all=reviews) | M S01 |
| P20 | [TapTap 用户评价](https://www.taptap.cn/review/48141439) | M S02 |
| P21 | [Last War 台湾评价](https://apps.apple.com/tw/app/%E6%9C%80%E5%BE%8C%E7%9A%84%E6%88%B0%E7%88%AD-last-war/id6448786147?platform=iphone&see-all=reviews) | M S03 |
| P22 | [Last War What am I missing](https://www.reddit.com/r/LastWarMobileGame/comments/1gi2gc3/what_am_i_missing/) | M S04 |
| P23 | [Real War 美区评价](https://apps.apple.com/us/app/real-war-not-fake/id6753818799?platform=iphone&see-all=reviews) | M S06 |
| P24 | [Real War 成长回退与疑似漏洞描述](https://www.reddit.com/r/AndroidGaming/comments/1v1bb5g/real_war_not_fake_possible_glitch/) | M S09；未复测，不传播操作 |
| P25 | [Last War 不喜欢被强制玩小游戏](https://www.reddit.com/r/LastWarMobileGame/comments/1np4c3c/these_mini_games_are_not_fun_to_me_they_are_time/) | M S10 |
| P26 | [Last War 手指遮挡、灵敏度、回玩](https://www.reddit.com/r/LastWarMobileGame/comments/1g60wf4/this_is_never_happening_its_been_days/) | M S11 |
| P27 | [Last War Serum 小游戏触控](https://www.reddit.com/r/LastWarMobileGame/comments/1uwj851/serum_minigame_is_driving_me_nuts_controls_feel/) | M S13；非数字门，邻近触控证据 |

P27 是直接参照产品 Last War 的评论页面，但讨论另一种小游戏；归入产品来源统计不意味着其机制与数字门相同，正文只将其作为邻近触控证据。

## 相邻品类的 11 个已读社区页面

“B”对应 balance.md 的 B 编号。

| ID | 内容与来源 | 底稿 |
|---|---|---|
| C01 | [Brotato D5 正反讨论](https://www.reddit.com/r/brotato/comments/1fieqnw/) | B03 |
| C02 | [roguelites 永久成长争论](https://www.reddit.com/r/roguelites/comments/17u524f/i_really_hate_meta_progression_in_modern/) | B04 |
| C03 | [Brotato Nightmare 开发者与玩家回复](https://steamcommunity.com/app/1942280/eventcomments/832746626412084871/) | B05；2026-05-12 |
| C04 | [Vampire Survivors 敌人等级疑问](https://steamcommunity.com/app/1794680/discussions/0/3489752656787156939/) | B06；2022-10-21 |
| C05 | [可选布局重玩](https://www.reddit.com/r/roguelites/comments/i0160n/) | B08 |
| C06 | [Brotato 新手策略理解](https://www.reddit.com/r/brotato/comments/1hm7awn/) | B09 |
| C07 | [Brotato 实战伤害统计诉求](https://steamcommunity.com/app/1942280/discussions/0/3364776031343264109/) | B10；2022-10-01 至 02 |
| C08 | [Brotato 新统计的玩家反馈](https://www.reddit.com/r/brotato/comments/zezh55/) | B11；搜索显示 2022-12-07 |
| C09 | [roguelites 永久成长偏好](https://www.reddit.com/r/roguelites/comments/1vxtszy/) | B13 |
| C10 | [Vampire Survivors Curse 风险奖励](https://steamcommunity.com/app/1794680/discussions/0/3194745797022996412/) | B14；2022-03-01 |
| C11 | [Brotato 平伤与百分比伤害](https://www.reddit.com/r/brotato/comments/y35ai5/meleeranged_damage_vs_damage/) | B15；搜索显示 2022-10-13 |

## 官方设计和技术的 11 个已读页面

| ID | 内容与来源 | 底稿 |
|---|---|---|
| O01 | [Supersonic 门跑酷设计](https://supersonic.com/?p=96551) | B01；2024-02-29 |
| O02 | [Unity 经济平衡指南第 3 部分](https://unity.com/how-to/design-balanced-in-game-economy-guide-part-3) | B02；页面未标出版日期 |
| O03 | [Hades FAQ](https://www.supergiantgames.com/blog/hades-faq/) | B07；2018-12-07 初发，2025-07-16 更新 |
| O04 | [Unity 经济指南第 2 部分](https://unity.com/how-to/building-game-economy-guide-part-2) | B16；页面未标出版日期 |
| O05 | [Hades Welcome to Hell 更新日志](https://www.supergiantgames.com/blog/hades-welcome-to-hell-update-patch-notes/) | B17；2019-12-03 起，含 12-12 小补丁 |
| O06 | [MDN Page Visibility API](https://developer.mozilla.org/en-US/docs/Web/API/Page_Visibility_API) | M T01 |
| O07 | [MDN setPointerCapture](https://developer.mozilla.org/en-US/docs/Web/API/Element/setPointerCapture) | M T02 |
| O08 | [MDN touch-action](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/touch-action) | M T03 |
| O09 | [MDN prefers-reduced-motion](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/At-rules/@media/prefers-reduced-motion) | M T04 |
| O10 | [MDN WebGL best practices](https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/WebGL_best_practices) | M T05 |
| O11 | [W3C WCAG 2.2 目标尺寸理解文档](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html) | M T06 |

## 2 个已读转载正文和 6 条 API 评价

| ID | 内容与来源 | 读取说明 |
|---|---|---|
| R01 | [Brotato Update 0.6.1.6](https://steamdb.info/patchnotes/10120663/) | B12；2022-12-10；SteamDB 转载，官方 Steam 原页未独立读成功 |
| R02 | [Astral Ascent 种子系统日志](https://steamdb.info/patchnotes/23915246/) | B 补充实例；2026-06-25；SteamDB 转载，官方跳转未得正文 |
| A01 | [Mob Control 简单有趣评价](https://steamcommunity.com/profiles/76561198029214416/recommended/2736490/) | D S08；2025-09-09；API 正文 |
| A02 | [Mob Control 偶发硬墙评价](https://steamcommunity.com/profiles/76561197985763174/recommended/2736490/) | D S14；2024-07-20；API 正文 |
| A03 | [Mob Control 数据不清评价](https://steamcommunity.com/profiles/76561198084343309/recommended/2736490/) | D S15；2024-08-03；API 正文 |
| A04 | [Mob Control 线性成长评价](https://steamcommunity.com/profiles/76561198080984079/recommended/2736490/) | D S16；2024-11-25；API 正文 |
| A05 | [Mob Control 后期刷取评价](https://steamcommunity.com/profiles/76561198327865407/recommended/2736490/) | D S17；2026-08-30；API 正文 |
| A06 | [Mob Control 输入迟钝评价](https://steamcommunity.com/profiles/76561197960420790/recommended/2736490/) | D S21；2026-01-29；API 正文 |

API 来源为 [Steam 官方英文评价接口](https://store.steampowered.com/appreviews/2736490?json=1&language=english&filter=recent&num_per_page=100&purchase_type=all&cursor=*)。日期由 `timestamp_created` 读取。A01—A06 的规范推荐页在浏览工具中未打开成功，若详情页不可达，可通过接口中的作者 ID 核对；接口返回会随时间与过滤条件变化，不保证永远在第一页。

## 未计入核心证据的访问记录

[Real War 是否能通关](https://www.reddit.com/r/iosgaming/comments/1udpskm/is_real_war_not_fake_beatable/) 读到的内容稀薄、回复对游戏识别也不稳定，作为低权重检视记录保留，不支撑无限血量结论。[B 站候选视频](https://www.bilibili.com/video/BV1s6an6EEDg/) 只有搜索摘要，原页报错；[抖音候选视频](https://www.douyin.com/video/7671734867394186515) 返回空文档；[YouTube 作者视频](https://www.youtube.com/watch?v=Vn-7hg-gj74) 只返回壳页面，未得评论或逐字稿；[巴哈姆特候选](https://forum.gamer.com.tw/C.php?bsn=60059&snA=5284) 搜索见标题，但原页打开失败。小红书、知乎、贴吧检索未取得可核实的相关评论。上述内容不纳入 51 页或 6 条评价，不声称已读取评论区。没有进入私密社群、读取登录后私有内容或发送消息。
