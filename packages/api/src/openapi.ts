import YAML from "yaml";

const supportedHttpMethods = [
  "get",
  "post",
  "put",
  "patch",
  "delete",
  "head",
  "options",
] as const;

type ParsedEndpoint = {
  method: string;
  path: string;
  operationId?: string | null;
  summary?: string | null;
  description?: string | null;
};

type ParsedOpenApiSpec = {
  apiName: string;
  baseUrl: string | null;
  specVersion: string;
  endpoints: ParsedEndpoint[];
};

type OpenApiDocument = {
  info?: {
    title?: unknown;
  };
  openapi?: unknown;
  swagger?: unknown;
  servers?: Array<{
    url?: unknown;
  }>;
  paths?: Record<string, Record<string, Record<string, unknown>> | undefined>;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const parseSpecText = (specText: string): OpenApiDocument => {
  const trimmedSpec = specText.trim();

  try {
    return JSON.parse(trimmedSpec) as OpenApiDocument;
  } catch {
    const parsedYaml = YAML.parse(trimmedSpec);
    if (!isRecord(parsedYaml)) {
      throw new Error("OpenAPI spec must be a JSON or YAML object");
    }

    return parsedYaml as OpenApiDocument;
  }
};

export const parseOpenApiSpec = (specText: string): ParsedOpenApiSpec => {
  const spec = parseSpecText(specText);

  if (!spec.openapi && !spec.swagger) {
    throw new Error("OpenAPI version is missing from the uploaded spec");
  }

  if (!spec.paths || !isRecord(spec.paths)) {
    throw new Error("OpenAPI spec does not contain any paths");
  }

  const endpoints: ParsedEndpoint[] = [];

  for (const [path, operations] of Object.entries(spec.paths)) {
    if (!path || !isRecord(operations)) {
      continue;
    }

    for (const method of supportedHttpMethods) {
      const operation = operations[method];

      if (!isRecord(operation)) {
        continue;
      }

      endpoints.push({
        method: method.toUpperCase(),
        path,
        operationId:
          typeof operation.operationId === "string"
            ? operation.operationId
            : null,
        summary:
          typeof operation.summary === "string" ? operation.summary : null,
        description:
          typeof operation.description === "string"
            ? operation.description
            : null,
      });
    }
  }

  if (endpoints.length === 0) {
    throw new Error(
      "No supported HTTP endpoints were found in the OpenAPI spec"
    );
  }

  const apiName =
    typeof spec.info?.title === "string" && spec.info.title.trim().length > 0
      ? spec.info.title.trim()
      : "Imported API";
  const baseUrl =
    typeof spec.servers?.[0]?.url === "string" && spec.servers[0].url.trim()
      ? spec.servers[0].url.trim()
      : null;

  return {
    apiName,
    baseUrl,
    specVersion: String(spec.openapi ?? spec.swagger),
    endpoints,
  };
};
