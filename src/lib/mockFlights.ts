import type { FlightLeg } from "@/lib/flights.functions";

export type Flight = {
  id: string;
  airline: string;
  airlineCode: string;
  price: number;
  currency: string;
  stops: number;
  duration: string;
  durationMin: number;
  outbound: FlightLeg;
  inbound?: FlightLeg;
};

const AIRLINES = [
  { name: "Lufthansa", code: "LH" },
  { name: "Turkish Airlines", code: "TK" },
  { name: "Emirates", code: "EK" },
  { name: "Qatar Airways", code: "QR" },
  { name: "KLM", code: "KL" },
  { name: "Air France", code: "AF" },
  { name: "Austrian", code: "OS" },
];

function pad(n: number) {
  return n.toString().padStart(2, "0");
}

function randomTime(baseHour: number) {
  const h = (baseHour + Math.floor(Math.random() * 4)) % 24;
  const m = Math.floor(Math.random() * 12) * 5;
  return `${pad(h)}:${pad(m)}`;
}

export function generateMockFlights(params: {
  from: string;
  to: string;
  departDate: string;
  returnDate?: string;
  pax: number;
}): Flight[] {
  const { from, to, departDate, returnDate } = params;
  return Array.from({ length: 6 }, (_, i) => {
    const airline = AIRLINES[i % AIRLINES.length];
    const stops = i === 0 ? 0 : i < 3 ? 1 : Math.random() > 0.6 ? 2 : 1;
    const basePrice = 180 + Math.floor(Math.random() * 420);
    const hours = 4 + stops * 3 + Math.floor(Math.random() * 5);
    const minutes = Math.floor(Math.random() * 12) * 5;
    const outboundDurationMin = hours * 60 + minutes;
    const inboundDurationMin = returnDate ? 5 * 60 + 30 + i * 20 : 0;
    const outboundDepart = randomTime(6 + i);
    const outboundArrive = randomTime(14 + i);
    const inboundDepart = randomTime(10 + i);
    const inboundArrive = randomTime(20 + i);
    return {
      id: `mock-${i}-${airline.code}`,
      airline: airline.name,
      airlineCode: airline.code,
      price: basePrice + (i === 0 ? 0 : i * 25),
      currency: "EUR",
      stops,
      duration: `${hours}h ${pad(minutes)}`,
      durationMin: outboundDurationMin + inboundDurationMin,
      outbound: {
        from: from || "LJU",
        to: to || "BKK",
        depart: outboundDepart,
        arrive: outboundArrive,
        date: departDate || new Date().toISOString().slice(0, 10),
        duration: `${hours}h ${pad(minutes)}m`,
        durationMin: outboundDurationMin,
        arriveDayOffset: 0,
        stops,
        airline: airline.name,
        airlineCode: airline.code,
      },
      inbound: returnDate
        ? {
            from: to || "BKK",
            to: from || "LJU",
            depart: inboundDepart,
            arrive: inboundArrive,
            date: returnDate,
            duration: `${Math.floor(inboundDurationMin / 60)}h ${pad(inboundDurationMin % 60)}m`,
            durationMin: inboundDurationMin,
            arriveDayOffset: 0,
            stops: i % 2,
            airline: airline.name,
            airlineCode: airline.code,
          }
        : undefined,
    };
  }).sort((a, b) => a.price - b.price);
}
