import type { AiClient } from './types.js';
import type { Article } from '../sources/types.js';
import type { PublishedTopic } from '../notion/publisher.js';
import { subDays } from 'date-fns';
import { extractJsonFromResponse } from '../utils/json.js';

export interface SelectionScore {
  id: string;
  novelty: number;
  impact: number;
  relevance: number;
  totalScore: number;
  selected: boolean;
}

interface SelectionResult {
  selected: Article[];
  scores: SelectionScore[];
}

interface ScoredArticle {
  id: string;
  novelty: number;
  impact: number;
  relevance: number;
  hasSpecifics: boolean;
  isReproducible: boolean;
  isPrimarySource: boolean;
}

export async function selectArticles(
  articles: Article[],
  client: AiClient,
  maxArticles: number,
  criteria: string[],
  publishedTopics: PublishedTopic[] = []
): Promise<SelectionResult> {
  if (articles.length === 0) {
    return { selected: [], scores: [] };
  }

  const articleList = articles.map((article, index) => {
    const parts = [
      `[${index}] id: ${article.id}`,
      `    title: ${article.title}`,
      `    url: ${article.url}`,
      `    summary: ${article.summary?.slice(0, 200) ?? ''}`,
      `    hasContent: ${!!article.content}`,
      `    contentPreview: ${article.content?.slice(0, 300) ?? ''}`,
      `    likeCount: ${article.likeCount ?? 'N/A'}`,
      `    repostCount: ${article.repostCount ?? 'N/A'}`,
      `    authorTier: ${article.authorTier ?? 'unknown'} (1=公式, 2=経営陣, 3=研究者, 4=開発者)`,
    ];
    return parts.join('\n');
  }).join('\n\n');

  const criteriaText = criteria.length > 0
    ? `選別基準:\n${criteria.map(c => `- ${c}`).join('\n')}`
    : '';

  const sevenDaysAgo = subDays(new Date(), 7);
  const recentTopics = publishedTopics.filter(
    t => new Date(t.publishedAt) >= sevenDaysAgo
  );

  const topicsSection = recentTopics.length > 0
    ? `\n\n## 過去7日間に公開済みのトピック:\n${recentTopics.map(t => `- ${t.publishedAt.split('T')[0]}: ${t.topic}`).join('\n')}\n\n重要: 上記トピックと同一または非常に類似するトピックの記事には novelty: 0 を付与してください。\n同じニュース・発表を異なるソースから取った記事も同一トピックとみなしてください。`
    : '';

  const systemPrompt = `あなたは海外AI/ML情報をキュレーションするエキスパートです。実用的で、開発者がすぐ試せる情報を重視します。
記事の重要度を以下の観点でスコアリングし、最も価値の高い記事を選別してください。

## スコアリング観点
- novelty (新規性): その情報がどれだけ新しい・斬新か（1-10）
- impact (影響度): AI/ML分野の開発者への影響の大きさ（1-10）
- relevance (実用性): AI/ML技術全般への関連性と読者の実用性（1-10）
  - 直接実用的（ベストプラクティス、チュートリアル、ツール解説、開発ワークフロー等）→ 8-10
  - 応用可能（LLMの新機能、API更新、プロンプト技術、研究成果等）→ 5-7
  - 関連薄い（一般的なビジネスニュース、投資動向等）→ 1-4

追加で以下の品質チェックも行い、真偽値で判定してください（スコアへの加算はシステム側で行います）:
- hasSpecifics (具体性): 具体的な数値、バージョン、ベンチマーク結果などが含まれているか
- isReproducible (再現可能性): コード例、手順、設定が含まれており読者が試せるか
- isPrimarySource (一次情報): 公式ブログ、論文、リリースノートなど一次情報源からの記事か

${criteriaText}${topicsSection}

## 実用性ブースト
以下に該当する記事は relevance と impact をそれぞれ +2 加点してください:
- ベストプラクティス・公式ガイド（プロンプト設計、API活用、モデル最適化等）
- チュートリアル・ハウツー記事（ステップバイステップの手順あり）
- 開発ワークフロー改善（AIツール統合、自動化、CI/CD連携等）
- コード生成・補完・リファクタリング技術
- エージェント型開発（agentic coding, AI pair programming等）

## ベストプラクティス・実践レポートブースト
以下に該当する記事は relevance と impact をそれぞれ +2 加点してください:
- 公式ドキュメント・ガイドのベストプラクティス（例: Anthropic公式のプロンプト設計ガイド、OpenAI Cookbook等）
- 個人開発者の成功談・体験談・ワークフロー共有
- AI活用の具体的なTips・ハウツー記事
- 実際のプロジェクトでのAIコーディング導入事例

## ソースティア
authorTier はソースの信頼度を示します。ティアが高い（数値が小さい）ソースからの情報は信頼性が高いため、スコアリング時に考慮してください。

## エンゲージメント
likeCount と repostCount はコミュニティの反応を示します。高いエンゲージメントは情報の重要性や注目度の指標として考慮してください。

## 本文取得済みブースト
以下に該当する記事は relevance と impact をそれぞれ +1 加点してください:
- hasContent が true の記事（リンク先の本文が取得済みで、より詳細な記事生成が可能）
- contentPreview に具体的な技術内容・コード例が含まれている記事はさらに +1

必ずJSON配列で回答してください。各要素は以下の形式:
{ "id": "<記事ID>", "novelty": <1-10>, "impact": <1-10>, "relevance": <1-10>, "hasSpecifics": <true/false>, "isReproducible": <true/false>, "isPrimarySource": <true/false> }`;

  const userPrompt = `以下の${articles.length}件の記事をスコアリングしてください。上位${maxArticles}件を選別します。\n\n${articleList}\n\nJSON配列のみ返してください。`;

  try {
    const response = await client.chat(systemPrompt, userPrompt);
    const jsonStr = extractJsonFromResponse(response);
    const scores: ScoredArticle[] = JSON.parse(jsonStr);

    // 総合スコアを計算してソート（不正値は 0 に丸める）
    const articleMap = new Map(articles.map(a => [a.id, a]));
    const scored = scores.map(s => {
      const article = articleMap.get(s.id);

      // ティアボーナス
      const tierBonus = article?.authorTier === 1 ? 1.0
                      : article?.authorTier === 2 ? 0.7
                      : article?.authorTier === 3 ? 0.3
                      : 0;

      // エンゲージメントボーナス
      const engagementBonus =
        (article?.likeCount ?? 0) >= 100 || (article?.repostCount ?? 0) >= 50 ? 1.0
        : (article?.likeCount ?? 0) >= 30 || (article?.repostCount ?? 0) >= 15 ? 0.5
        : 0;

      const hasUsableContent = !!(article?.content || article?.summary);
      const noContentPenalty = hasUsableContent ? 0 : -5;

      const bonus =
        (s.hasSpecifics ? 0.5 : 0) +
        (s.isReproducible ? 0.5 : 0) +
        (s.isPrimarySource ? 0.5 : 0) +
        tierBonus +
        engagementBonus;
      const totalScore = ((Number(s.novelty) || 0) + (Number(s.impact) || 0) + (Number(s.relevance) || 0)) / 3 + bonus + noContentPenalty;
      return {
        id: s.id,
        novelty: Number(s.novelty) || 0,
        impact: Number(s.impact) || 0,
        relevance: Number(s.relevance) || 0,
        totalScore,
        selected: false,  // will be set below
      };
    });
    scored.sort((a, b) => b.totalScore - a.totalScore);

    // Mark top N as selected
    for (let i = 0; i < Math.min(maxArticles, scored.length); i++) {
      scored[i].selected = true;
    }

    const selectedIds = new Set(scored.filter(s => s.selected).map(s => s.id));

    return {
      selected: articles.filter(a => selectedIds.has(a.id)),
      scores: scored,
    };
  } catch (error) {
    // API エラー時は先頭 maxArticles 件を返す
    console.error('選別APIエラー（先頭N件を返します）:', error);
    return { selected: articles.slice(0, maxArticles), scores: [] };
  }
}
