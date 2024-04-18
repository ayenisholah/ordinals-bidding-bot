import fs from "fs"

import { fetchCollections } from './functions/Collection';
import { retrieveTokens } from './functions/Tokens';
import { getOffers } from './functions/Offer'
import path from "path";

async function run() {
  try {
    const collections = await fetchCollections()
    let count = 0;

    for (const collection of collections) {
      const collectionSymbol = collection.collectionSymbol

      const name = collection.name
      const image = collection.image
      const floorPrice = collection.fp

      const tokens = await retrieveTokens(collectionSymbol, 100)
      const scannedTokens = tokens.length

      console.log({ collectionSymbol, count });


      const tokensWithNoOffers = []
      const tokensWithOffers = []
      let listedMakerFeeBp;

      for (const token of tokens) {
        const tokenId = token?.id
        listedMakerFeeBp = token && token.listedMakerFeeBp ? token.listedMakerFeeBp : 0

        const data = await getOffers(tokenId)
        const highestOffer = data && data.offers.length > 0 && data.offers[0].price ? data.offers[0].price * 0.00000001 : 0;

        if (highestOffer === 0) {
          tokensWithNoOffers.push({ tokenId, highestOffer })
        } else {
          tokensWithOffers.push({ tokenId, highestOffer })
        }
      }

      const offers = tokensWithOffers.map(item => item.highestOffer)
      const totalOffers = offers.reduce((accumulator, currentValue) => {
        return accumulator + currentValue;
      }, 0);

      const averageOffer = isNaN(Number((totalOffers / tokensWithOffers.length).toFixed(6))) ? 0 : Number((totalOffers / tokensWithOffers.length).toFixed(6))
      const tokensWithOffersCount = tokensWithOffers.length
      const tokensWithNoOffersCount = tokensWithNoOffers.length

      const percentageOfTokensWithOffers = tokensWithOffersCount / scannedTokens * 100

      const makerFee = listedMakerFeeBp ? listedMakerFeeBp / 100 / 100 : 0

      const potentialProfit = isNaN(Number((floorPrice - averageOffer - (averageOffer * makerFee)).toFixed(6))) ? 0 : Number((floorPrice - averageOffer - (averageOffer * makerFee)).toFixed(6))

      const riskOrReward = isNaN((averageOffer + (averageOffer * makerFee)) / potentialProfit) ? 0 : (averageOffer + (averageOffer * makerFee)) / potentialProfit

      console.log({
        name,
        collectionSymbol,
        image,
        averageOffer,
        floorPrice,
        listedMakerFeeBp,
        scannedTokens,
        percentageOfTokensWithOffers,
        riskOrReward,
        potentialProfit: +potentialProfit,
        tokensWithNoOffers: tokensWithNoOffersCount,
        tokensWithOffers: tokensWithOffersCount,
        offers
      });


      const collectionData = {
        name,
        collectionSymbol,
        image,
        averageOffer,
        floorPrice,
        listedMakerFeeBp,
        scannedTokens,
        percentageOfTokensWithOffers,
        riskOrReward,
        potentialProfit: +potentialProfit,
        tokensWithNoOffers: tokensWithNoOffersCount,
        tokensWithOffers: tokensWithOffersCount,
        offers
      }
      count += 1
      const collectionJSON = JSON.stringify(collectionData, null, 2);
      const collectionDir = path.join(__dirname, 'collections');

      // Create the directory if it doesn't exist
      if (!fs.existsSync(collectionDir)) {
        fs.mkdirSync(collectionDir, { recursive: true });
      }

      const filePath = path.join(collectionDir, `${collectionSymbol}.json`);

      fs.writeFile(filePath, collectionJSON, "utf-8", (err) => {
        if (err) {
          console.error("Error writing JSON to file:", err);
          return;
        }
        console.log(`Collection created and saved to ${filePath}`);
      });
    }
  } catch (error) {
    console.log(error);
  }
}

run()