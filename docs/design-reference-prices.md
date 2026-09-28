# 方案知识资料与 BOM 参考价

方案接口会把 `lib/agent/hardware-design-knowledge.ts` 中的内置基础工程规则加入每次模型请求，包含供电、接口、电池、BOM 拆分及估价规则。结果返回知识资料的 ID 和版本，页面与下载文档保留版本信息。

内置规则是随应用发布的静态资料；另外，方案/Agent/EDA 已通过受控关键词检索使用有权访问的已发布正文及私有 FTS 片段。这不是向量检索，也不是供应商实时报价接口；自动入索引资料未经人工技术复核。

## 参考价格

- 模型仍为能够合理估算的 BOM 项填写人民币小批量参考单价或区间，并标注“估算”。数量是独立字段，价格不是整行总价。
- 线上方案结果、Markdown 下载及项目 BOM/CSV 优先为**完整精确匹配**的型号显示公开供应商单件报价快照。币种沿用供应商页面，不做无依据的美元兑人民币换算；其余项目保持模型估算。`A/B`、`或同类`、只有系列名等不匹配某个商品页。
- 2026-09-28 核查的单件档快照（LCSC，USD）：[ESP32-C3-MINI-1-N4 / C2838502，$3.8274](https://www.lcsc.com/product-detail/rf%20modules_espressif%20systems_esp32-c3-mini-1-n4_C2838502.html)、[BH1750FVI-TR / C78960，$0.9515](https://www.lcsc.com/product-detail/C78960.html)、[BQ24074RGTR / C54313，$2.1424](https://www.lcsc.com/product-detail/Battery-Management_Texas-Instruments-BQ24074RGTR_C54313.html)、[MCP73871T-2CCI/ML / C511310，$2.2010](https://www.lcsc.com/product-detail/C511310.html)。[ESP32-S3-WROOM-1-N8R8 / C2913201，$5.0496](https://www.lcsc.com/product-detail/wifi%20modules_espressif%20systems_esp32-s3-wroom-1-n8r8_C2913201.html) 当时页面标为缺货，价格只是供应商参考价，UI/CSV 明确区分。
- 这些是网页核查日的价格快照，不是实时库存、可成交承诺或批量询价；价格会变，且不含税、运费、汇率及 SMT 服务费用。生成时间不等于供应商报价时间，采购前需打开商品页重新核价。
- 不允许统一填“未核价”或留空；确实无法估算的定制件允许填写“无法估算：具体原因”，不强制编造数字。
- 结构校验不代表价格准确、库存充足或硬件验证完成。当前不在用户请求时联网抓价，且不是覆盖全器件的报价目录。

## 后续改进：价格依据随方案保存（本地候选，未发布）

新方案在模型 JSON 校验后由**服务端**按精确型号计算并保存每行价格依据（来源 URL、供应商料号、币种显示、核查日期/起订量，或模型估算）。模型试图自带的价格依据字段会被解析器丢弃。后续修改应用内报价表不会改写已完成方案的页面、Markdown 或 CSV。旧方案没有生成时快照，因此沿用当前报价表时必须提示“当前参考，不代表生成当时价格”；项目 BOM API 还会返回 `priceRecorded` 标记。JSONB 结果字段兼容旧记录，无数据库迁移。此项目前仅代码和测试完成，未发布到生产，不能将旧方案追溯为已留痕。

## 验证

- `__tests__/llm-routes.test.ts` 验证规则进入真实模型调用边界，并拒绝无价格的占位 BOM。
- `scripts/verify-design-knowledge.mjs <base>` 验证页面 bundle，再执行一条真实最小硬件方案请求检查参考价和知识版本；会消耗少量模型额度，不持久保存方案或修改工程。
- 加 `--static` 只校验页面，不调用模型。服务器需通过 root-only 环境文件加载验证凭据，不输出密钥。
