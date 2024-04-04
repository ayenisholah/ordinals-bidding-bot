import { config } from "dotenv"
import Bottleneck from "bottleneck";

config()

const RATE_LIMIT = Number(process.env.RATE_LIMIT) ?? 4

const limiter = new Bottleneck({
  minTime: 1 / RATE_LIMIT,
});

export default limiter