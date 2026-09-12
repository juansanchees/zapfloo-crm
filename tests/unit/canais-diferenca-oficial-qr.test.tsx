import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ChannelChoiceGuide } from "@/components/connections/ChannelChoiceGuide";

describe("guia de canais", () => {
  it("não mistura API Oficial com QR nem promete impedir banimento", () => {
    render(<ChannelChoiceGuide />);
    expect(screen.getByText("API Oficial da Meta")).toBeInTheDocument();
    expect(screen.getByText("Conexão por QR")).toBeInTheDocument();
    expect(screen.getByText(/Não é a API Oficial/)).toBeInTheDocument();
    expect(screen.getByText(/não promete impedir banimento/i)).toBeInTheDocument();
  });
});
