import dynamic from "next/dynamic";
import Head from "next/head";

const ContractorApp = dynamic(() => import("../CustomerApp").then((mod) => mod.ContractorApp), { ssr: false });

export default function ContractorsPage() {
  return (
    <>
      <Head>
        <title>Contractor Portal — Harry's List DFW</title>
        <meta name="robots" content="noindex" />
      </Head>
      <ContractorApp />
    </>
  );
}
