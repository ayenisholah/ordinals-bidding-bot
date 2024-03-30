import fs from "fs"
import sequelize from "./database";
import { collectionActivity } from "./functions/Collection";

async function dbConnect() {
  try {
    await sequelize.authenticate()
    await sequelize.sync({ alter: true })
  } catch (error) {
    console.log(error);
  }
}

dbConnect().then(() => console.log('DATABASE CONNECTED SUCCESSFULLY!')).catch(error => console.log(error))

export async function activityStream(collectionSymbol: string) {
  try {
    const collectionOffers = await collectionActivity(collectionSymbol)

  } catch (error) {
    console.log(error);
  }
}

