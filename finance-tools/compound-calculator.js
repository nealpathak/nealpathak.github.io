class CompoundCalculator {
    constructor() {
        this.chart = null;
        this.scenarios = {
            conservative: { initial: 5000, monthly: 200, rate: 4, years: 30, increase: 2 },
            moderate: { initial: 10000, monthly: 500, rate: 7, years: 30, increase: 3 },
            aggressive: { initial: 15000, monthly: 800, rate: 10, years: 25, increase: 4 },
            retirement: { initial: 0, monthly: 1000, rate: 8, years: 40, increase: 3 }
        };
        
        this.init();
    }
    
    init() {
        this.setupEventListeners();
        this.calculate(); // Initial calculation
    }
    
    setupEventListeners() {
        // Input change listeners
        const inputs = ['initialAmount', 'monthlyContribution', 'annualRate', 'timeHorizon', 'compoundFrequency', 'contributionIncrease'];
        inputs.forEach(id => {
            const element = document.getElementById(id);
            element.addEventListener('input', () => this.calculate());
            element.addEventListener('change', () => this.calculate());
        });
        
        // Calculate button
        document.getElementById('calculateButton').addEventListener('click', () => this.calculate());
        
        // Scenario buttons
        document.querySelectorAll('.scenario-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const scenario = e.target.dataset.scenario;
                this.loadScenario(scenario);
            });
        });
        
        // Real-time calculation as user types
        document.addEventListener('keyup', (e) => {
            if (e.target.matches('#initialAmount, #monthlyContribution, #annualRate, #timeHorizon, #contributionIncrease')) {
                clearTimeout(this.calculateTimeout);
                this.calculateTimeout = setTimeout(() => this.calculate(), 500);
            }
        });
    }
    
    loadScenario(scenarioName) {
        const scenario = this.scenarios[scenarioName];
        if (!scenario) return;
        
        document.getElementById('initialAmount').value = scenario.initial;
        document.getElementById('monthlyContribution').value = scenario.monthly;
        document.getElementById('annualRate').value = scenario.rate;
        document.getElementById('timeHorizon').value = scenario.years;
        document.getElementById('contributionIncrease').value = scenario.increase;
        document.getElementById('compoundFrequency').value = '12'; // Monthly
        
        // Highlight the selected scenario button
        document.querySelectorAll('.scenario-btn').forEach(btn => {
            btn.style.background = btn.dataset.scenario === scenarioName ? '#f0fdf4' : '';
            btn.style.borderColor = btn.dataset.scenario === scenarioName ? '#16a34a' : '';
            btn.style.color = btn.dataset.scenario === scenarioName ? '#16a34a' : '';
        });
        
        this.calculate();
    }
    
    calculate() {
        const params = this.getInputParameters();
        if (!this.validateInputs(params)) return;
        
        const results = this.computeCompoundGrowth(params);
        this.displayResults(results);
        this.updateChart(results.yearlyData);
        this.displayYearlyBreakdown(results.yearlyData);
    }
    
    getInputParameters() {
        return {
            initialAmount: parseFloat(document.getElementById('initialAmount').value) || 0,
            monthlyContribution: parseFloat(document.getElementById('monthlyContribution').value) || 0,
            annualRate: parseFloat(document.getElementById('annualRate').value) || 0,
            timeHorizon: parseInt(document.getElementById('timeHorizon').value) || 0,
            compoundFrequency: parseInt(document.getElementById('compoundFrequency').value) || 12,
            contributionIncrease: parseFloat(document.getElementById('contributionIncrease').value) || 0
        };
    }
    
    validateInputs(params) {
        if (params.timeHorizon <= 0) return false;
        if (params.annualRate < 0 || params.annualRate > 30) return false;
        return true;
    }
    
    computeCompoundGrowth(params) {
        const { initialAmount, monthlyContribution, annualRate, timeHorizon, compoundFrequency, contributionIncrease } = params;
        
        let balance = initialAmount;
        let totalContributions = initialAmount;
        let currentMonthlyContribution = monthlyContribution;
        
        const yearlyData = [];
        const monthlyRate = (annualRate / 100) / compoundFrequency;
        const periodsPerYear = compoundFrequency;
        const totalPeriods = timeHorizon * periodsPerYear;
        
        // Track yearly snapshots
        for (let year = 0; year <= timeHorizon; year++) {
            if (year === 0) {
                yearlyData.push({
                    year,
                    balance: initialAmount,
                    contributions: initialAmount,
                    interest: 0,
                    monthlyContribution: currentMonthlyContribution
                });
                continue;
            }
            
            const yearStartBalance = balance;
            const yearStartContributions = totalContributions;
            
            // Calculate for each period in the year
            for (let period = 0; period < periodsPerYear; period++) {
                // Add monthly contribution (adjusted for frequency)
                const contributionThisPeriod = currentMonthlyContribution * (12 / periodsPerYear);
                balance += contributionThisPeriod;
                totalContributions += contributionThisPeriod;
                
                // Apply compound interest
                balance *= (1 + monthlyRate);
            }
            
            // Increase monthly contribution for next year
            currentMonthlyContribution *= (1 + contributionIncrease / 100);
            
            const interestThisYear = balance - yearStartBalance - (totalContributions - yearStartContributions);
            
            yearlyData.push({
                year,
                balance,
                contributions: totalContributions,
                interest: balance - totalContributions,
                interestThisYear,
                monthlyContribution: currentMonthlyContribution
            });
        }
        
        const finalBalance = balance;
        const totalInterest = finalBalance - totalContributions;
        const growthMultiple = initialAmount > 0 ? finalBalance / initialAmount : finalBalance / (monthlyContribution * 12);
        
        return {
            finalBalance,
            totalContributions,
            totalInterest,
            growthMultiple,
            yearlyData,
            effectiveRate: annualRate,
            params
        };
    }
    
    displayResults(results) {
        document.getElementById('finalBalance').textContent = this.formatCurrency(results.finalBalance);
        document.getElementById('totalContributions').textContent = this.formatCurrency(results.totalContributions);
        document.getElementById('interestEarned').textContent = this.formatCurrency(results.totalInterest);
        document.getElementById('growthMultiple').textContent = `${results.growthMultiple.toFixed(1)}x`;
        
        // Color code the interest earned based on how much of the total it represents
        const interestPercentage = (results.totalInterest / results.finalBalance) * 100;
        const interestElement = document.getElementById('interestEarned');
        
        if (interestPercentage >= 60) {
            interestElement.style.color = '#059669'; // Green for high compound effect
        } else if (interestPercentage >= 40) {
            interestElement.style.color = '#3b82f6'; // Blue for moderate compound effect
        } else {
            interestElement.style.color = '#f59e0b'; // Orange for lower compound effect
        }
    }
    
    updateChart(yearlyData) {
        const ctx = document.getElementById('growthChart').getContext('2d');
        
        if (this.chart) {
            this.chart.destroy();
        }
        
        const labels = yearlyData.map(data => `Year ${data.year}`);
        const balanceData = yearlyData.map(data => data.balance);
        const contributionData = yearlyData.map(data => data.contributions);
        const interestData = yearlyData.map(data => data.interest);
        
        this.chart = new Chart(ctx, {
            type: 'line',
            data: {
                labels,
                datasets: [{
                    label: 'Total Balance',
                    data: balanceData,
                    borderColor: '#16a34a',
                    backgroundColor: 'rgba(22, 163, 74, 0.1)',
                    borderWidth: 3,
                    fill: true,
                    tension: 0.1
                }, {
                    label: 'Total Contributions',
                    data: contributionData,
                    borderColor: '#3b82f6',
                    backgroundColor: 'rgba(59, 130, 246, 0.1)',
                    borderWidth: 2,
                    fill: false,
                    tension: 0.1
                }, {
                    label: 'Interest Earned',
                    data: interestData,
                    borderColor: '#f59e0b',
                    backgroundColor: 'rgba(245, 158, 11, 0.1)',
                    borderWidth: 2,
                    fill: false,
                    tension: 0.1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: {
                            callback: function(value) {
                                return '$' + value.toLocaleString();
                            }
                        },
                        title: {
                            display: true,
                            text: 'Amount ($)'
                        }
                    },
                    x: {
                        title: {
                            display: true,
                            text: 'Time'
                        }
                    }
                },
                plugins: {
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                return context.dataset.label + ': $' + context.parsed.y.toLocaleString();
                            },
                            afterBody: function(tooltipItems) {
                                const yearData = yearlyData[tooltipItems[0].dataIndex];
                                if (yearData.year > 0) {
                                    return [
                                        `Monthly Contribution: $${yearData.monthlyContribution.toLocaleString()}`,
                                        `Interest This Year: $${yearData.interestThisYear?.toLocaleString() || '0'}`
                                    ];
                                }
                                return [];
                            }
                        }
                    },
                    legend: {
                        display: true,
                        position: 'top'
                    }
                },
                interaction: {
                    intersect: false,
                    mode: 'index'
                }
            }
        });
    }
    
    displayYearlyBreakdown(yearlyData) {
        const container = document.getElementById('yearlyBreakdown');
        
        let tableHTML = `
            <table>
                <thead>
                    <tr>
                        <th>Year</th>
                        <th>Monthly Contribution</th>
                        <th>Total Balance</th>
                        <th>Total Contributions</th>
                        <th>Interest Earned</th>
                        <th>Growth Rate</th>
                    </tr>
                </thead>
                <tbody>
        `;
        
        yearlyData.forEach((data, index) => {
            const growthRate = index > 0 ? 
                ((data.balance - yearlyData[index-1].balance) / yearlyData[index-1].balance * 100) : 0;
            
            tableHTML += `
                <tr>
                    <td><strong>${data.year}</strong></td>
                    <td>$${data.monthlyContribution.toLocaleString()}</td>
                    <td><strong>$${data.balance.toLocaleString()}</strong></td>
                    <td>$${data.contributions.toLocaleString()}</td>
                    <td style="color: #059669;">$${data.interest.toLocaleString()}</td>
                    <td>${index > 0 ? `${growthRate.toFixed(1)}%` : '-'}</td>
                </tr>
            `;
        });
        
        tableHTML += '</tbody></table>';
        container.innerHTML = tableHTML;
    }
    
    formatCurrency(amount) {
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: 'USD',
            minimumFractionDigits: 0,
            maximumFractionDigits: 0
        }).format(amount);
    }
}

// Initialize calculator when page loads
document.addEventListener('DOMContentLoaded', () => {
    new CompoundCalculator();
});