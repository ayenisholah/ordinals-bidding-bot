interface Step {
  id: string;
  action: string;
  description: string;
  kind: string;
  items: Item[];
}

interface Item {
  status: string;
  orderIds: string[];
  data: CancelData;
}

interface CancelData {
  sign: Sign;
  post: Post;
}

interface Sign {
  signatureKind: string;
  domain: Domain;
  types: Types;
  value: Value;
  primaryType: string;
}

interface Domain {
  name: string;
  version: string;
  chainId: number;
}

interface Types {
  OrderHashes: OrderHash[];
}

interface OrderHash {
  name: string;
  type: string;
}

interface Value {
  orderHashes: string[];
}

interface Post {
  endpoint: string;
  method: string;
  body: Body;
}

interface Body {
  orderIds: string[];
  orderKind: string;
}

export interface CancelRequest {
  steps: Step[];
}