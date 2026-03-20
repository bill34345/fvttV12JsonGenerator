# Problems

- `ActionParser.parse` currently fails to extract AOE Cone information (e.g., "覆盖 90 尺锥形区域").
- `ActionParser.parse` currently fails to extract Versatile damage (e.g., "双手使用时为 16 (2d12+6)").
- `ActionParser.parse` currently fails to extract Recharge information correctly when it's part of a simple text description (e.g., "火焰吐息 [充能 5-6]: 覆盖 90 尺锥形区域").
