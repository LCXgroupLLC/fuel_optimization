# fuel_optimization

Fuel and cargo volume optimization: a small web app to compare cargo revenue across locations and find the cargo and fuel volumes that give the most revenue.

The first two columns are the **Origin** and **Destination**; **+** adds more locations and **×** removes one. For each location enter:

- **Cargo volume** (kg): the cargo you carry
- **Cargo rate** ($/kg): what each kg of cargo earns
- **Fuel price** ($/US gal): what each US gallon of fuel costs
- **Fuel volume** (US gal): the fuel needed for that cargo volume (you work this out yourself)

The app then shows:

- **Fuel total** ($) = fuel price × fuel volume
- **Cargo income** ($) = cargo volume × cargo rate
- **Revenue** ($) = cargo income − fuel total
- **Overall revenue** ($) = the revenue of all locations added together

A bar chart compares cargo income, fuel total and revenue for each location, plus an **Overall** group with everything added together. Hover a bar to see how
it was worked out.

### Adjust values

A slider for every input. Dragging one updates the table and the chart, and a message tells you
whether the overall revenue is higher or lower than your best saved scenario.

For each location you can also set:

- **Cargo volume min / max**: the range of cargo you could carry
- **Fuel volume at min cargo / at max cargo**: the fuel volume you need when carrying the min and the max cargo

Fuel volume then rises in a straight line between those two points, and dragging the cargo volume moves the
fuel with it.

### Optimal values

**Compute optimal** only runs when the cargo rate, fuel price and all four min/max values are filled in for every location; otherwise a message box lists what's missing and the empty boxes are outlined in red. It finds the cargo volume in each range that gives the most overall revenue, with the
cargo rate and fuel price as they are. Each extra kg of cargo earns the cargo rate but needs more fuel:

```
fuel cost per extra kg of cargo = (fuel gal at max − fuel gal at min) / (max cargo kg − min cargo kg) × fuel $/gal
```

If the cargo rate is higher, carry the max; if the fuel cost is higher (expensive fuel at that
airport), carry the min. **Use and save these values** puts the result into the table and chart and adds it to Saved.

### Saved

**Save** (next to the chart title) keeps the current values. Saved scenarios are listed at the bottom
with each location's revenue and the overall revenue; the highest is tagged **Best**. **Load** puts a
saved scenario back into the table, **Delete** removes it. Saved scenarios are kept while you work, including when you add, remove or change locations, and are cleared when you refresh the page.

## Run

No build step. Open `index.html` in a browser, or serve the folder:

```bash
python3 -m http.server 8000
```

Then visit http://localhost:8000.
