import { config } from "dotenv"

config()
import { collectionActivity } from "./functions/Collection";

async function main() {
  try {
    const data = await collectionActivity('the-prophecy')


    const tokenIds = data?.activities.map(item => item.tokenId)

    // const uniqueArray = Array.from(new Set(tokenIds));

    console.log({ uniqueArray: tokenIds?.length });



  } catch (error) {
    console.log(error);
  }
}


main().catch(error => console.log(error))