class MarketDashboard {
    constructor() {
        this.currentPeriod = '1m';
        this.spyData = [];
        this.vixData = [];
        this.priceChart = null;
        this.correlationChart = null;
        this.isLoading = false;
        
        // Initialize immediately with demo data to avoid infinite loading
        this.init();
    }
    
    async init() {
        try {
            this.setupEventListeners();
            this.setupCharts(); // Setup empty charts first
            this.loadDemoData(); // Then load data and update charts
            this.hideLoading();
        } catch (error) {
            console.error('Initialization error:', error);
            this.hideLoading();
        }
    }
    
    setupEventListeners() {
        // Time period buttons
        const timeButtons = document.querySelectorAll('.time-btn');
        timeButtons.forEach(btn => {
            btn.addEventListener('click', (e) => {
                timeButtons.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.currentPeriod = btn.dataset.period;
                this.loadDemoData(); // Use demo data for reliability
            });
        });
        
        // Refresh button
        document.getElementById('refreshData').addEventListener('click', () => {
            this.loadDemoData();
        });
    }
    
    loadDemoData() {
        const now = new Date();
        const days = this.getPeriodDays();
        const spyBase = 450;
        const vixBase = 18;
        
        this.spyData = [];
        this.vixData = [];
        
        for (let i = days; i >= 0; i--) {
            const date = new Date(now);
            date.setDate(date.getDate() - i);
            
            // Create realistic market data
            const trend = Math.sin(i / 20) * 20;
            const volatility = Math.random() * 10 - 5;
            
            const spyPrice = spyBase + trend + volatility;
            const vixPrice = Math.max(10, vixBase + (trend * -0.3) + (volatility * -0.5) + Math.random() * 5);
            
            this.spyData.push({
                date: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
                close: Math.round(spyPrice * 100) / 100,
                open: Math.round((spyPrice + Math.random() * 2 - 1) * 100) / 100,
                high: Math.round((spyPrice + Math.random() * 3) * 100) / 100,
                low: Math.round((spyPrice - Math.random() * 3) * 100) / 100
            });
            
            this.vixData.push({
                date: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
                close: Math.round(vixPrice * 100) / 100,
                open: Math.round((vixPrice + Math.random() * 1 - 0.5) * 100) / 100,
                high: Math.round((vixPrice + Math.random() * 2) * 100) / 100,
                low: Math.round((vixPrice - Math.random() * 2) * 100) / 100
            });
        }
        
        this.updateCharts();
        this.updateMetrics();
        this.updateLastUpdated();
    }
    
    getPeriodDays() {
        const periodDays = {
            '1m': 30,
            '3m': 90,
            '6m': 180,
            '1y': 365,
            '2y': 730,
            '5y': 1825
        };
        return periodDays[this.currentPeriod] || 30;
    }
    
    setupCharts() {
        this.setupPriceChart();
        this.setupCorrelationChart();
    }
    
    setupPriceChart() {
        const ctx = document.getElementById('priceChart').getContext('2d');
        
        this.priceChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: [],
                datasets: [{
                    label: 'SPY Price',
                    data: [],
                    borderColor: '#10b981',
                    backgroundColor: 'rgba(16, 185, 129, 0.1)',
                    borderWidth: 2,
                    fill: false,
                    tension: 0.1,
                    yAxisID: 'y'
                }, {
                    label: 'VIX Level',
                    data: [],
                    borderColor: '#ef4444',
                    backgroundColor: 'rgba(239, 68, 68, 0.1)',
                    borderWidth: 2,
                    fill: false,
                    tension: 0.1,
                    yAxisID: 'y1'
                }]
            },
            options: {
                responsive: false,
                maintainAspectRatio: false,
                interaction: {
                    intersect: false,
                    mode: 'index'
                },
                scales: {
                    x: {
                        display: true,
                        title: {
                            display: true,
                            text: 'Date'
                        }
                    },
                    y: {
                        type: 'linear',
                        display: true,
                        position: 'left',
                        title: {
                            display: true,
                            text: 'SPY Price ($)'
                        }
                    },
                    y1: {
                        type: 'linear',
                        display: true,
                        position: 'right',
                        title: {
                            display: true,
                            text: 'VIX Level'
                        },
                        grid: {
                            drawOnChartArea: false,
                        },
                    }
                },
                plugins: {
                    legend: {
                        display: false
                    }
                }
            }
        });
    }
    
    setupCorrelationChart() {
        const ctx = document.getElementById('correlationChart').getContext('2d');
        
        this.correlationChart = new Chart(ctx, {
            type: 'scatter',
            data: {
                datasets: [{
                    label: 'SPY vs VIX',
                    data: [],
                    backgroundColor: 'rgba(59, 130, 246, 0.6)',
                    borderColor: '#3b82f6',
                    borderWidth: 1,
                    pointRadius: 4
                }]
            },
            options: {
                responsive: false,
                maintainAspectRatio: false,
                scales: {
                    x: {
                        title: {
                            display: true,
                            text: 'VIX Level'
                        }
                    },
                    y: {
                        title: {
                            display: true,
                            text: 'SPY Price ($)'
                        }
                    }
                },
                plugins: {
                    legend: {
                        display: false
                    }
                }
            }
        });
    }
    
    updateCharts() {
        if (!this.priceChart || !this.correlationChart || !this.spyData.length) return;
        
        // Update price chart
        const labels = this.spyData.map(item => item.date);
        const spyPrices = this.spyData.map(item => item.close);
        const vixLevels = this.vixData.map(item => item.close);
        
        this.priceChart.data.labels = labels;
        this.priceChart.data.datasets[0].data = spyPrices;
        this.priceChart.data.datasets[1].data = vixLevels;
        this.priceChart.update();
        
        // Update correlation chart
        const correlationData = this.spyData.map((spy, index) => {
            if (index < this.vixData.length) {
                return { x: this.vixData[index].close, y: spy.close };
            }
            return null;
        }).filter(point => point !== null);
        
        this.correlationChart.data.datasets[0].data = correlationData;
        this.correlationChart.update();
    }
    
    updateMetrics() {
        if (!this.spyData.length || !this.vixData.length) return;
        
        const latestSpy = this.spyData[this.spyData.length - 1];
        const latestVix = this.vixData[this.vixData.length - 1];
        const previousSpy = this.spyData[this.spyData.length - 2] || latestSpy;
        const previousVix = this.vixData[this.vixData.length - 2] || latestVix;
        
        // Update current values
        document.getElementById('spyPrice').textContent = `$${latestSpy.close.toFixed(2)}`;
        document.getElementById('vixPrice').textContent = latestVix.close.toFixed(2);
        
        // Update changes
        const spyChange = latestSpy.close - previousSpy.close;
        const spyChangePercent = (spyChange / previousSpy.close * 100);
        const vixChange = latestVix.close - previousVix.close;
        const vixChangePercent = (vixChange / previousVix.close * 100);
        
        const spyChangeEl = document.getElementById('spyChange');
        spyChangeEl.textContent = `${spyChange >= 0 ? '+' : ''}${spyChange.toFixed(2)} (${spyChangePercent >= 0 ? '+' : ''}${spyChangePercent.toFixed(2)}%)`;
        spyChangeEl.className = `metric-change ${spyChange >= 0 ? 'positive' : 'negative'}`;
        
        const vixChangeEl = document.getElementById('vixChange');
        vixChangeEl.textContent = `${vixChange >= 0 ? '+' : ''}${vixChange.toFixed(2)} (${vixChangePercent >= 0 ? '+' : ''}${vixChangePercent.toFixed(2)}%)`;
        vixChangeEl.className = `metric-change ${vixChange >= 0 ? 'negative' : 'positive'}`;
        
        // Calculate correlation
        const correlation = this.calculateCorrelation();
        document.getElementById('correlation').textContent = correlation.toFixed(3);
        
        // Set volatility regime
        const volatilityRegime = this.getVolatilityRegime(latestVix.close);
        const regimeEl = document.getElementById('volatilityRegime');
        regimeEl.textContent = volatilityRegime.label;
        regimeEl.className = `metric-value ${volatilityRegime.class}`;
        
        // Update statistics
        this.updateStatistics();
    }
    
    calculateCorrelation() {
        if (this.spyData.length < 2 || this.vixData.length < 2) return 0;
        
        const minLength = Math.min(this.spyData.length, this.vixData.length);
        const spyPrices = this.spyData.slice(-minLength).map(d => d.close);
        const vixLevels = this.vixData.slice(-minLength).map(d => d.close);
        
        const spyMean = spyPrices.reduce((sum, val) => sum + val, 0) / spyPrices.length;
        const vixMean = vixLevels.reduce((sum, val) => sum + val, 0) / vixLevels.length;
        
        let numerator = 0;
        let spyVariance = 0;
        let vixVariance = 0;
        
        for (let i = 0; i < spyPrices.length; i++) {
            const spyDiff = spyPrices[i] - spyMean;
            const vixDiff = vixLevels[i] - vixMean;
            
            numerator += spyDiff * vixDiff;
            spyVariance += spyDiff * spyDiff;
            vixVariance += vixDiff * vixDiff;
        }
        
        const denominator = Math.sqrt(spyVariance * vixVariance);
        return denominator === 0 ? 0 : numerator / denominator;
    }
    
    getVolatilityRegime(vixLevel) {
        if (vixLevel < 15) return { label: 'Low', class: 'volatility-low' };
        if (vixLevel < 25) return { label: 'Normal', class: 'volatility-normal' };
        if (vixLevel < 35) return { label: 'Elevated', class: 'volatility-elevated' };
        return { label: 'High', class: 'volatility-high' };
    }
    
    updateStatistics() {
        // Simple placeholder statistics
        document.getElementById('vixPercentile').textContent = '65%';
        document.getElementById('spyVolatility').textContent = '16.8%';
        document.getElementById('daysSinceSpike').textContent = '45';
        document.getElementById('maxDrawdown').textContent = '8.2%';
    }
    
    updateLastUpdated() {
        const now = new Date();
        document.getElementById('lastUpdated').textContent = now.toLocaleString();
    }
    
    hideLoading() {
        const loadingEl = document.getElementById('loadingOverlay');
        if (loadingEl) {
            loadingEl.classList.add('hidden');
        }
    }
}

// Initialize dashboard when page loads
document.addEventListener('DOMContentLoaded', () => {
    try {
        new MarketDashboard();
    } catch (error) {
        console.error('Failed to initialize dashboard:', error);
        // Hide loading even if initialization fails
        const loadingEl = document.getElementById('loadingOverlay');
        if (loadingEl) {
            loadingEl.classList.add('hidden');
        }
    }
});