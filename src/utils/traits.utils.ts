import Ajv from "ajv"

export function validateTraits(jsonData: Trait | Trait[]) {
  const ajv = new Ajv();
  const dataType = Array.isArray(jsonData) ? "array" : "object"
  const schema = {
    type: dataType,
    items: {
      type: "object",
      required: ["traitType", "value"],
      properties: {
        traitType: { type: "string" },
        value: { type: ["string", "number"] }
      }
    }
  };
  const validate = ajv.compile(schema);
  const isValid = validate(jsonData);

  if (!isValid) {
    console.log('--------------------------------------------------------------------------------');

    console.log("INVALID TRAIT FORMAT");
    console.log('--------------------------------------------------------------------------------'); console.log(validate.errors);
  } else {
    console.log('--------------------------------------------------------------------------------');

    console.log("VALID TRAIT FORMAT");
    console.log('--------------------------------------------------------------------------------');

  }
  return isValid
}

export function transformTrait(jsonArray: Trait[]) {
  const groupedObjects: any = {};

  jsonArray.forEach(obj => {
    const { traitType } = obj;
    if (!groupedObjects[traitType]) {
      groupedObjects[traitType] = [];
    }
    groupedObjects[traitType].push(obj);
  });

  const target = Object.values(groupedObjects).map(group => {
    return { attributes: group };
  });

  return target;
}


export interface Trait {
  traitType: string;
  value: string | number;
}

export interface Attribute {
  attributes: Trait[];
}

export interface TransformedData {
  attributes: Attribute[];
}
