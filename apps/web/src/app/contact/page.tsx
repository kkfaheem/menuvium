import ContactClient from "./ContactClient";

export default function ContactPage({
    searchParams,
}: {
    searchParams?: { plan?: string | string[] };
}) {
    const raw = searchParams?.plan;
    const plan = Array.isArray(raw) ? raw[0] : raw || "";

    return <ContactClient plan={plan} />;
}

