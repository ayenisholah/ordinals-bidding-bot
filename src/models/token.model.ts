import { Schema, model } from "mongoose";

interface IToken {
  name: string;
  collectionSymbol: string;
  averageOffer: number;
  floorPrice: number;
  image: string;
  listedMakerFeeBp: number;
  scannedTokens: number;
  tokensWithOffers: number;
  tokensWithNoOffers: number;
  percentageOfTokensWithOffers: number;
  potentialProfit: number;
  riskOrReward: number;
  offers: number[]
}

const tokenSchema = new Schema<IToken>({
  name: {
    type: String,
  },
  collectionSymbol: {
    type: String
  },
  image: {
    type: String
  },
  averageOffer: {
    type: Number
  },

  floorPrice: {
    type: Number
  },
  listedMakerFeeBp: {
    type: Number
  },
  scannedTokens: {
    type: Number
  },
  tokensWithOffers: {
    type: Number
  },
  tokensWithNoOffers: {
    type: Number
  },
  percentageOfTokensWithOffers: {
    type: Number
  },
  potentialProfit: {
    type: Number
  },
  riskOrReward: {
    type: Number
  },
  offers: {
    type: [Number]
  }
})

export const TokenModel = model("token", tokenSchema);