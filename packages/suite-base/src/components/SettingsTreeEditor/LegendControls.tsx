// SPDX-FileCopyrightText: Copyright (C) 2025 Takayuki Honda <takayuki.honda@tier4.jp>
// SPDX-License-Identifier: MPL-2.0

import AddIcon from "@mui/icons-material/Add";
import RemoveIcon from "@mui/icons-material/Remove";
import { IconButton } from "@mui/material";

import { useLegendCount } from "./useLegendCount";

export const LegendControls = ({ chartType }: { chartType: string }): React.JSX.Element => {
  const { increment, decrement } = useLegendCount(chartType);

  return (
    <div style={{ display: "flex", gap: 5 }}>
      <IconButton
        onClick={increment}
        color="primary"
        sx={{
          border: "1px solid",
          borderColor: "primary.main",
          width: 25,
          height: 25,
        }}
      >
        <AddIcon />
      </IconButton>
      <IconButton
        onClick={decrement}
        color="primary"
        sx={{
          border: "1px solid",
          borderColor: "primary.main",
          width: 25,
          height: 25,
        }}
      >
        <RemoveIcon />
      </IconButton>
    </div>
  );
};
