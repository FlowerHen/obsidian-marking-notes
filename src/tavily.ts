import { requestUrl } from 'obsidian';

export interface TavilySearchResult {
    title: string;
    url: string;
    content: string;
    score: number;
}

export interface TavilySearchResponse {
    query: string;
    results: TavilySearchResult[];
}

export class TavilyClient {
    static async search(apiKey: string, query: string, maxResults: number = 3, searchDepth: 'basic' | 'advanced' = 'basic'): Promise<TavilySearchResult[]> {
        if (!apiKey) return [];

        try {
            const response = await requestUrl({
                url: 'https://api.tavily.com/search',
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    api_key: apiKey,
                    query,
                    max_results: maxResults,
                    search_depth: searchDepth,
                    include_answer: false,
                    include_raw_content: false
                })
            });

            if (response.status !== 200) {
                console.error('Tavily API error:', response.status, response.text);
                return [];
            }

            const data = response.json;
            return (data.results || []) as TavilySearchResult[];
        } catch (e) {
            console.error('Tavily search failed:', e);
            return [];
        }
    }

    static formatSearchResults(results: TavilySearchResult[]): string {
        if (results.length === 0) return '';

        let formatted = '\n\n【网络搜索结果】\n以下是从网络搜索到的相关信息，请结合这些信息丰富你的分析：\n\n';
        for (let i = 0; i < results.length; i++) {
            const r = results[i];
            formatted += `来源${i + 1}: ${r.title}\n`;
            formatted += `链接: ${r.url}\n`;
            formatted += `摘要: ${r.content}\n\n`;
        }
        formatted += '请在分析中适当参考上述搜索结果，但不要直接大段复制，要有选择性地融合到你的分析中。\n';

        return formatted;
    }
}