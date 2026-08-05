import type { CardLayoutBounds, CardLayoutInput, CardLayoutOptions, CardLayoutResult } from "./card-layout";

export interface CardLayoutWorkerRequest {
  key: string;
  cards: CardLayoutInput[];
  bounds: CardLayoutBounds;
  options: CardLayoutOptions;
}

export interface CardLayoutWorkerMessage extends CardLayoutWorkerRequest {
  type: "solve";
  requestId: number;
}

export interface CardLayoutWorkerResponse {
  type: "result";
  requestId: number;
  key: string;
  result: CardLayoutResult;
}
