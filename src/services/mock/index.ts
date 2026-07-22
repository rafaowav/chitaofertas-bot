import type { OfferData } from '../../types/index.js';

const mockOffers: OfferData[] = [
  {
    source: 'shopee',
    sourceId: 'mock_fone_xiaomi',
    title: 'Fone de Ouvido Bluetooth Xiaomi',
    description: 'Cancelamento de ruído, 40h de bateria, carregamento USB-C',
    price: 129.90,
    currency: 'BRL',
    imageUrl: 'https://picsum.photos/seed/fone/600/400',
    affiliateUrl: 'https://shopee.com.br/mock-fone',
  },
  {
    source: 'amazon',
    sourceId: 'mock_tv_lg',
    title: 'Smart TV LG 43" 4K',
    description: 'Smart TV com WebOS, HDR10, Wi-Fi integrado, 3 HDMI',
    price: 1899.00,
    currency: 'BRL',
    imageUrl: 'https://picsum.photos/seed/tv/600/400',
    affiliateUrl: 'https://amzn.to/mock-tv',
  },
  {
    source: 'amazon',
    sourceId: 'mock_kindle',
    title: 'Kindle 11ª Geração',
    description: 'Leve, compacto, com luz embutida ajustável, bateria dura semanas',
    price: 399.90,
    currency: 'BRL',
    affiliateUrl: 'https://amzn.to/mock-kindle',
  },
  {
    source: 'shopee',
    sourceId: 'mock_smartband',
    title: 'Smartband Mi Band 8',
    description: 'Monitor cardíaco, steps, sono, tela AMOLED 1.62"',
    price: 179.90,
    currency: 'BRL',
    imageUrl: 'https://picsum.photos/seed/band/600/400',
    affiliateUrl: 'https://shopee.com.br/mock-band',
  },
  {
    source: 'amazon',
    sourceId: 'mock_echo',
    title: 'Echo Dot 5ª Geração',
    description: 'Smart speaker com Alexa, som mais definido, hub Zigbee',
    price: 349.00,
    currency: 'BRL',
    imageUrl: 'https://picsum.photos/seed/echo/600/400',
    affiliateUrl: 'https://amzn.to/mock-echo',
  },
  {
    source: 'shopee',
    sourceId: 'mock_carregador',
    title: 'Carregador GaN 65W',
    description: 'Carregamento rápido para notebook e celular, 3 portas',
    price: 89.90,
    currency: 'BRL',
    affiliateUrl: 'https://shopee.com.br/mock-gan',
  },
];

let index = 0;

export function getNextMockOffer(): OfferData {
  const offer = mockOffers[index];
  index = (index + 1) % mockOffers.length;
  return offer;
}
