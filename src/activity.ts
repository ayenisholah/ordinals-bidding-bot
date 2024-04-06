import { OfferPlaced } from "./functions/Collection";
import limiter from "./bottleneck";
import axiosInstance from "./axios/axiosInstance";


const API_KEY = process.env.API_KEY as string;

const headers = {
  'Content-Type': 'application/json',
  'X-NFT-API-Key': API_KEY,
}


async function main(collectionSymbol: string) {
  try {
    const { lists, offers } = await getCollectionActivity(collectionSymbol, 20)

  } catch (error) {
    console.log(error);
  }
}

main("rune_gods")


async function getCollectionActivity(
  collectionSymbol: string,
  bidCount: number,
  lastSeenTimestamp: number | null = null
) {
  const url = "https://nfttools.pro/magiceden/v2/ord/btc/activities";
  const params: any = {
    limit: 100,
    collectionSymbol,
    kind: ["list", "offer_placed"],
    disablePendingTransactions: true,
  };

  try {
    let lists: OfferPlaced[] = [];
    let offers: any[] = [];
    let response;
    let offset = 0;
    let uniqueListCount = 0;
    let uniqueOfferPlacedCount = 0;
    const uniqueListTokenIds = new Set();
    const uniqueOfferPlacedTokenIds = new Set();

    do {
      params.offset = offset;
      response = await limiter.schedule({ priority: 5 }, () =>
        axiosInstance.get(url, { params, headers })
      );

      for (const activity of response.data.activities) {
        if (lastSeenTimestamp !== null) {
          const activityTimestamp = new Date(activity.createdAt).getTime();
          if (activityTimestamp >= lastSeenTimestamp) {
            break;
          }
        }

        if (activity.kind === "list") {
          if (uniqueListCount < bidCount && !uniqueListTokenIds.has(activity.tokenId)) {
            uniqueListTokenIds.add(activity.tokenId);
            uniqueListCount++;
            lists.push(activity);
          }
        } else if (activity.kind === "offer_placed") {
          if (!uniqueOfferPlacedTokenIds.has(activity.tokenId)) {
            uniqueOfferPlacedTokenIds.add(activity.tokenId);
            uniqueOfferPlacedCount++;
            offers.push(activity);
          }
        }

        if (uniqueListCount + uniqueOfferPlacedCount === params.limit) {
          break;
        }
      }

      offset += response.data.activities.length;
    } while (
      (lastSeenTimestamp === null && uniqueListCount + uniqueOfferPlacedCount < params.limit) ||
      (lastSeenTimestamp !== null && new Date(response.data.activities[response.data.activities.length - 1]?.createdAt).getTime() > lastSeenTimestamp)
    );


    return { lists, offers };
  } catch (error: any) {
    console.error("Error fetching collection activity:", error.data);
    return { lists: [], offers: [] };
  }
}