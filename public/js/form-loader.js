class FormLoader {
    constructor() {
        this.formContainer = document.getElementById('form-container');
        this.loadingForm = false;
    }

    async loadForm(formName) {
        if (this.loadingForm) return;
        this.loadingForm = true;

        try {
            const response = await fetch(`forms/${formName}.php`);
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            const html = await response.text();
            
            // 清空容器并插入新表单
            this.formContainer.innerHTML = '';
            this.formContainer.insertAdjacentHTML('beforeend', html);
            
            // 确保所有表单元素都正确加载
            this.initializeFormElements();
            
        } catch (error) {
            console.error('Error loading form:', error);
            this.formContainer.innerHTML = `<div class="alert alert-error">Error loading form: ${error.message}. Please try again.</div>`;
        } finally {
            this.loadingForm = false;
        }
    }

    initializeFormElements() {
        // 初始化所有select元素
        const selects = this.formContainer.querySelectorAll('select');
        selects.forEach(select => {
            select.style.display = 'block';
            select.style.visibility = 'visible';
        });

        // 初始化所有input元素
        const inputs = this.formContainer.querySelectorAll('input');
        inputs.forEach(input => {
            input.style.display = 'block';
            input.style.visibility = 'visible';
        });
    }
}

// 初始化表单加载器
document.addEventListener('DOMContentLoaded', () => {
    const formLoader = new FormLoader();
    
    // 处理标签点击
    document.querySelectorAll('.nav-tab').forEach(tab => {
        tab.addEventListener('click', (e) => {
            const formName = e.target.dataset.form;
            
            // 更新活动标签
            document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
            e.target.classList.add('active');
            
            // 加载表单
            formLoader.loadForm(formName);
        });
    });

    // 加载默认表单
    const activeTab = document.querySelector('.nav-tab.active');
    if (activeTab) {
        formLoader.loadForm(activeTab.dataset.form);
    }
}); 