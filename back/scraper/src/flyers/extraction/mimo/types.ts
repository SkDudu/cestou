export type MimoOffer = {
  name: string;
  brand: string | null;
  quantity: string | null;
  unit: string | null;
  price: number;
  originalPrice: number | null;
  discount: number | null;
  pageNumber: number | null;
};

export type MimoResponse = {
  offers: MimoOffer[];
  confidence?: number | null;
};

export type ChatCompletionResponse = {
  choices?: Array<{ message?: { content?: string } }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
};
