import { absolute } from './metadata';

/**
 * Structured data.
 *
 * Deliberately NOT Product/Offer. A mandi quote is a market observation, not something
 * this site sells: Google will not grant price rich-results for it, and marking up
 * thousands of pages with fake Offers is a well-worn route to a manual spam action.
 * `Dataset` + `ItemList` describes what these pages actually are, and `FAQPage` and
 * `BreadcrumbList` are the two types that do reliably earn enhanced results here.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = Record<string, any>;

export function breadcrumbs(items: { name: string; path: string }[]): Json {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: item.name,
      item: absolute(item.path),
    })),
  };
}

export function faqPage(entries: { question: string; answer: string }[]): Json {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: entries.map((e) => ({
      '@type': 'Question',
      name: e.question,
      acceptedAnswer: { '@type': 'Answer', text: e.answer },
    })),
  };
}

export function priceDataset(params: {
  name: string;
  description: string;
  path: string;
  /** ISO datetime the upstream feed was last refreshed. Drives the freshness signal. */
  modified: string | null;
  spatial: string;
  variable: string;
}): Json {
  return {
    '@context': 'https://schema.org',
    '@type': 'Dataset',
    name: params.name,
    description: params.description,
    url: absolute(params.path),
    ...(params.modified ? { dateModified: params.modified } : {}),
    isBasedOn: 'https://data.gov.in/resource/9ef84268-d588-465a-a308-a864a43d0070',
    creator: {
      '@type': 'GovernmentOrganization',
      name: 'Directorate of Marketing & Inspection, Ministry of Agriculture and Farmers Welfare',
      url: 'https://agmarknet.gov.in/',
    },
    license: 'https://data.gov.in/government-open-data-license-india',
    spatialCoverage: { '@type': 'Place', name: params.spatial },
    variableMeasured: params.variable,
    measurementTechnique: 'Daily APMC mandi arrival and price reporting',
  };
}

export function itemList(params: {
  name: string;
  items: { name: string; description: string }[];
}): Json {
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: params.name,
    numberOfItems: params.items.length,
    itemListElement: params.items.map((item, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: item.name,
      description: item.description,
    })),
  };
}

export function webSite(name: string, description: string): Json {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name,
    description,
    url: absolute('/'),
    potentialAction: {
      '@type': 'SearchAction',
      target: {
        '@type': 'EntryPoint',
        urlTemplate: absolute('/en/search?q={search_term_string}'),
      },
      'query-input': 'required name=search_term_string',
    },
  };
}

/** Renders one or more JSON-LD blocks. */
export function JsonLd({ data }: { data: Json | Json[] }) {
  const blocks = Array.isArray(data) ? data : [data];
  return (
    <>
      {blocks.map((block, i) => (
        <script
          key={i}
          type="application/ld+json"
          // Server-rendered from our own data, never from user input.
          dangerouslySetInnerHTML={{ __html: JSON.stringify(block) }}
        />
      ))}
    </>
  );
}
