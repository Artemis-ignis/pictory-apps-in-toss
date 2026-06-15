import type { MobileNet } from "@tensorflow-models/mobilenet";

type Prediction = {
  className: string;
  probability: number;
};

let modelPromise: Promise<MobileNet | null> | null = null;

export async function inferVisualHints(dataUri: string): Promise<string[]> {
  if (!canUseVisualClassifier(dataUri)) {
    return [];
  }

  try {
    const [model, image] = await Promise.all([
      withTimeout(loadModel(), 6000),
      loadImage(dataUri),
    ]);

    if (model == null) {
      return [];
    }

    const predictions = await withTimeout(model.classify(image, 5), 4500);
    return mapPredictionsToHints(predictions);
  } catch {
    return [];
  }
}

function canUseVisualClassifier(dataUri: string) {
  return (
    Boolean(dataUri) &&
    typeof window !== "undefined" &&
    typeof Image !== "undefined"
  );
}

function loadModel() {
  if (modelPromise == null) {
    modelPromise = (async () => {
      try {
        await import("@tensorflow/tfjs-backend-cpu");
        const tf = await import("@tensorflow/tfjs-core");
        await tf.setBackend("cpu");
        await tf.ready();
        const mobilenet = await import("@tensorflow-models/mobilenet");
        return await mobilenet.load({ version: 2, alpha: 0.5 });
      } catch {
        return null;
      }
    })();
  }

  return modelPromise;
}

function loadImage(dataUri: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.decoding = "async";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Image load failed"));
    image.src = dataUri.startsWith("data:")
      ? dataUri
      : `data:image/jpeg;base64,${dataUri}`;
  });
}

function mapPredictionsToHints(predictions: Prediction[]) {
  const hints = new Set<string>();

  for (const prediction of predictions) {
    if (prediction.probability < 0.08) {
      continue;
    }

    const label = prediction.className.toLowerCase();
    for (const token of label.split(/[\s,/_-]+/).filter(Boolean)) {
      hints.add(token);
    }

    if (matches(label, FOOD_TERMS)) {
      hints.add("food");
      hints.add("음식");
    }
    if (matches(label, PLACE_TERMS)) {
      hints.add("place");
      hints.add("travel");
      hints.add("장소");
    }
    if (matches(label, PEOPLE_TERMS)) {
      hints.add("people");
      hints.add("person");
      hints.add("사람");
    }
    if (matches(label, DOCUMENT_TERMS)) {
      hints.add("document");
      hints.add("문서");
    }
    if (matches(label, COUPON_TERMS)) {
      hints.add("coupon");
      hints.add("barcode");
      hints.add("쿠폰");
    }
  }

  return Array.from(hints).slice(0, 14);
}

function matches(label: string, terms: RegExp[]) {
  return terms.some((term) => term.test(label));
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(
      () => reject(new Error("Visual classifier timeout")),
      timeoutMs,
    );

    promise
      .then(resolve)
      .catch(reject)
      .finally(() => window.clearTimeout(timeout));
  });
}

const FOOD_TERMS = [
  /food/,
  /plate/,
  /dish/,
  /pizza/,
  /restaurant/,
  /bakery/,
  /coffee/,
  /espresso/,
  /cup/,
  /bowl/,
  /menu/,
  /cheeseburger/,
  /hotdog/,
  /ice cream/,
];

const PLACE_TERMS = [
  /mountain/,
  /seashore/,
  /valley/,
  /lakeside/,
  /promontory/,
  /cliff/,
  /alp/,
  /park/,
  /street/,
  /building/,
  /palace/,
  /beacon/,
  /pier/,
  /bridge/,
  /castle/,
];

const PEOPLE_TERMS = [
  /person/,
  /people/,
  /portrait/,
  /face/,
  /suit/,
  /bow tie/,
  /jersey/,
  /gown/,
  /wig/,
  /sweatshirt/,
  /mask/,
  /cowboy hat/,
  /academic/,
];

const DOCUMENT_TERMS = [
  /document/,
  /paper/,
  /book/,
  /envelope/,
  /notebook/,
  /binder/,
  /web site/,
  /packet/,
  /menu/,
];

const COUPON_TERMS = [/barcode/, /qr/, /coupon/, /ticket/, /cash machine/];
